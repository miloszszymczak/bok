/**
 * Integration tests against a real Postgres. Run with TEST_DATABASE_URL set, e.g.
 *   TEST_DATABASE_URL=postgres://bok:bok@localhost:5432/bok_test npm test
 * Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from '@bok/core';
import { createDb, user } from '@bok/db';
import { runMigrations } from '@bok/db/migrate';
import type { LookupResult, MetadataClient } from '@bok/metadata';
import { sql } from 'drizzle-orm';
import { createAccounts } from '../src/accounts.ts';
import { uuidv7 as uid } from '@bok/core';
import { createCatalog } from '../src/catalog.ts';
import { createReading } from '../src/reading.ts';
import { createShelves } from '../src/shelves.ts';
import { createLibrary } from '../src/library.ts';
import { createNotifications } from '../src/notifications.ts';
import { createSocial } from '../src/social.ts';
import { createReadlists } from '../src/readlists.ts';
import { createPosts } from '../src/posts.ts';
import { toEditable, fromEditable, toPlain } from '@bok/core';
import type { Mailer } from '../src/email.ts';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';
import { profiles, follows } from '@bok/db';
import { eq } from 'drizzle-orm';
import * as webpush from 'web-push';

import type { Queue } from '../src/queue.ts';
import type { Storage } from '../src/storage.ts';
import type { Kv } from '../src/valkey.ts';

const url = process.env.TEST_DATABASE_URL;

const BOOKS: Record<string, { title: string; author: string; work?: string }> = {
	'9788375780635': { title: 'Ostatnie życzenie', author: 'Andrzej Sapkowski', work: '/works/OL1W' },
	'9788370540289': { title: 'Ostatnie życzenie', author: 'Andrzej Sapkowski', work: '/works/OL1W' }, // another edition
	'9780547928227': { title: 'The Hobbit', author: 'J.R.R. Tolkien' },
	'9788378865759': { title: 'Bóg i geometria', author: 'Michał Heller' },
	'9788382251586': { title: 'Jak człowiek staje się mordercą', author: 'Richard Taylor' }
};

const fakeMetadata: MetadataClient = {
	providers: ['openlibrary'],
	async lookup(id) {
		const b = id.kind === 'isbn' ? BOOKS[id.isbn13] : undefined;
		const result: LookupResult = {
			identifier: id,
			merged: b ? { title: b.title, contributors: [{ name: b.author, role: 'author' }], olWorkKey: b.work } : null,
			quality: b ? 50 : 0,
			results: b ? [{ provider: 'openlibrary', status: 'hit', ms: 1, record: {}, raw: {} }] : [{ provider: 'openlibrary', status: 'miss', ms: 1 }]
		};
		return result;
	}
};

function memoryKv(): Kv {
	const m = new Map<string, string>();
	return {
		get: async (k: string) => m.get(k) ?? null,
		set: async (k: string, v: string) => (m.set(k, v), 'OK'),
		del: async (k: string) => (m.delete(k) ? 1 : 0),
		incr: async (k: string) => {
			const n = Number(m.get(k) ?? 0) + 1;
			m.set(k, String(n));
			return n;
		},
		expire: async () => 1
	} as unknown as Kv;
}

const noQueue = { send: async () => null } as unknown as Queue;
const storage = { url: (k: string) => `/media/${k}`, put: async () => {} } as unknown as Storage;


describe.skipIf(!url)('posts & feed (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 4 });
	const kv = memoryKv();
	const mailer: Mailer = { send: async () => {} };
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue: noQueue });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const notifications = createNotifications({ db, mailer, cfg: { origin: 'http://localhost' } });
	const social = createSocial({ db, kv, storage, notifications });
	const lists = createReadlists({ db, storage, notifications });
	const postsSvc = createPosts({ db, storage, notifications });
	const reading = createReading({ db, storage });
	const ids: Record<string, string> = {};
	let hobbit = '';
	let sap = '';

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions, tags cascade`);
		for (const n of ['author', 'friend', 'follower', 'stranger', 'mentioned']) {
			const [u] = await db.insert(user).values({ name: n, email: `${n}@test.local` }).returning({ id: user.id });
			await accounts.bootstrap({ id: u!.id, name: n, email: `${n}@test.local` }, 'en');
			ids[n] = u!.id;
		}
		await social.requestFriend(ids.friend!, ids.author!);
		await social.acceptFriend(ids.author!, ids.friend!);
		await social.follow(ids.follower!, ids.author!);
		const h = await catalog.lookup('9780547928227');
		const s = await catalog.lookup('9788375780635');
		hobbit = h.status === 'found' ? h.workId : '';
		sap = s.status === 'found' ? s.workId : '';
	});

	const handle = async (id: string) => (await db.query.profiles.findFirst({ where: (t, { eq }) => eq(t.userId, id) }))!.handle;

	it('friends-only: visible to a friend who does not follow, not to a follower who is not a friend', async () => {
		const id = await postsSvc.create(ids.author!, { body: 'Tylko dla znajomych', visibility: 'friends' });
		expect(await postsSvc.get(ids.friend!, id)).not.toBeNull();
		expect(await postsSvc.get(ids.follower!, id)).toBeNull();
		expect(await postsSvc.get(ids.stranger!, id)).toBeNull();
		expect(await postsSvc.get(null, id)).toBeNull();
		// Comments follow the post: the follower can't comment or see comments either.
		await postsSvc.addComment(ids.friend!, id, { body: 'super' });
		expect(await postsSvc.comments(ids.follower!, id)).toEqual([]);
		await expect(postsSvc.addComment(ids.follower!, id, { body: 'x' })).rejects.toThrow();
		expect((await postsSvc.comments(ids.friend!, id)).map((c) => c.author.displayName)).toEqual(['friend']);
	});

	it('book chips survive edits, mentions notify once, tags are stored', async () => {
		const m = await handle(ids.mentioned!);
		const body = `Czytam $[The Hobbit](book:${hobbit}) #fantasy @${m}`;
		const id = await postsSvc.create(ids.author!, { body });
		expect(await notifications.unread(ids.mentioned!)).toBe(1);
		const { text, books } = toEditable(body);
		await postsSvc.update(ids.author!, id, { body: fromEditable(text.replace('Czytam', 'Skończyłem') + ` i $[Ostatnie](book:${sap})`, books) });
		const p = (await postsSvc.get(ids.stranger!, id))!;
		expect(p.editedAt).not.toBeNull();
		expect(p.nodes.filter((n) => n.t === 'book').map((n) => (n as { workId: string }).workId)).toEqual([hobbit, sap]);
		expect(Object.keys(p.books).sort()).toEqual([hobbit, sap].sort());
		expect(await notifications.unread(ids.mentioned!)).toBe(1); // no second mention notification on edit
		expect((await postsSvc.aboutWork(null, sap)).posts.map((x) => x.id)).toEqual([id]);
		expect((await postsSvc.byTag(null, 'fantasy')).posts.map((x) => x.id)).toEqual([id]);
	});

	it('mentions only notify people who can see the post', async () => {
		const m = await handle(ids.mentioned!);
		await postsSvc.create(ids.author!, { body: `cicho @${m}`, visibility: 'friends' });
		expect(await notifications.unread(ids.mentioned!)).toBe(0);
	});

	it('spoilers are hidden from previews', async () => {
		const open = await postsSvc.create(ids.author!, { body: 'Na końcu ||Bilbo wraca|| do domu' });
		const whole = await postsSvc.create(ids.author!, { body: 'Cały spoiler', spoiler: true });
		expect((await postsSvc.preview(open))?.text).toBe('Na końcu ▒▒▒ do domu');
		expect((await postsSvc.preview(whole))?.text).toBeNull();
		expect(toPlain('a ||b|| c')).not.toContain('b');
	});

	it('feed: posts, reads and public lists from my circle, newest first, paginated', async () => {
		await postsSvc.create(ids.stranger!, { body: 'obcy — nie w feedzie' });
		const p1 = await postsSvc.create(ids.author!, { body: 'pierwszy' });
		await reading.finish(ids.author!, hobbit, { date: '2026-03-01', precision: 'day', rating: 8, review: 'Piękne' });
		const list = await lists.create(ids.author!, { title: 'Publiczna', visibility: 'public' });
		await lists.create(ids.author!, { title: 'Prywatna' });
		const p2 = await postsSvc.create(ids.author!, { body: 'dla znajomych', visibility: 'friends' });
		const f = await postsSvc.feed(ids.friend!);
		expect(f.items.map((i) => i.kind)).toEqual(['post', 'list', 'read', 'post']);
		expect(f.items[0]).toMatchObject({ kind: 'post', post: { id: p2 } });
		expect(f.items[1]).toMatchObject({ kind: 'list', id: list.id });
		expect(f.items[2]).toMatchObject({ kind: 'read', rating: 8, review: 'Piękne' });
		const followerFeed = await postsSvc.feed(ids.follower!);
		expect(followerFeed.items.map((i) => (i.kind === 'post' ? i.post.id : i.kind))).toEqual(['list', 'read', p1]);
		const strangerFeed = await postsSvc.feed(ids.stranger!);
		expect(strangerFeed.items.every((i) => i.kind !== 'post' || i.post.author.userId === ids.stranger)).toBe(true);
		// Pagination: 2 per page, no duplicates, nothing missing.
		const seen: string[] = [];
		let cursor: string | null = null;
		do {
			const page = await postsSvc.feed(ids.friend!, cursor, 2);
			seen.push(...page.items.map((i) => i.key));
			cursor = page.next;
		} while (cursor);
		expect(seen).toEqual(f.items.map((i) => i.key));
	});

	it('likes, blocks and moderation', async () => {
		const id = await postsSvc.create(ids.author!, { body: 'lubisz?' });
		await postsSvc.like(ids.stranger!, 'post', id);
		await postsSvc.like(ids.stranger!, 'post', id);
		expect((await postsSvc.get(ids.stranger!, id))).toMatchObject({ likes: 1, liked: true });
		await social.block(ids.author!, ids.stranger!);
		expect(await postsSvc.get(ids.stranger!, id)).toBeNull();
		await expect(postsSvc.like(ids.stranger!, 'post', id)).rejects.toThrow();
		await social.report(ids.friend!, { targetType: 'post', targetId: id, targetUserId: ids.author!, reason: 'spam', details: '' });
		const [r] = await social.openReports();
		expect(r?.target_text).toBe('lubisz?');
		await social.resolve(ids.friend!, r!.id, 'hide');
		expect(await postsSvc.get(ids.friend!, id)).toBeNull();
		expect(await social.profile(ids.friend!, await handle(ids.author!))).not.toBeNull(); // only the post is hidden
	});
});
