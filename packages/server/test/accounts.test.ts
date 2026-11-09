/**
 * Account lifecycle + regression tests from the code sweep (real Postgres; TEST_DATABASE_URL):
 * deletion purge (sessions, avatar file, loans kept for the other side), single-use invites under
 * concurrency, idempotent scans scoped to my copies, friend-request notification dedupe,
 * post deletion clears likes, "today" in the reader's timezone.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from '@bok/core';
import { copies, createDb, likes, loans as loansTable, notifications as notifTable, profiles, reads, session, user } from '@bok/db';
import { runMigrations } from '@bok/db/migrate';
import type { LookupResult, MetadataClient } from '@bok/metadata';
import { and, eq, sql } from 'drizzle-orm';
import { createAccounts } from '../src/accounts.ts';
import { createCatalog } from '../src/catalog.ts';
import { createShelves } from '../src/shelves.ts';
import { createLibrary } from '../src/library.ts';
import { createNotifications } from '../src/notifications.ts';
import { createSocial } from '../src/social.ts';
import { createLoans } from '../src/loans.ts';
import { createPosts } from '../src/posts.ts';
import { createReading } from '../src/reading.ts';
import type { Mailer } from '../src/email.ts';
import type { Queue } from '../src/queue.ts';
import type { Storage } from '../src/storage.ts';
import type { Kv } from '../src/valkey.ts';

const url = process.env.TEST_DATABASE_URL;
const fakeMetadata: MetadataClient = {
	providers: ['openlibrary'],
	async lookup(id) {
		const hit = id.kind === 'isbn' && id.isbn13 === '9780547928227';
		return {
			identifier: id,
			merged: hit ? { title: 'The Hobbit', contributors: [{ name: 'J.R.R. Tolkien', role: 'author' }] } : null,
			quality: hit ? 50 : 0,
			results: [{ provider: 'openlibrary', status: hit ? 'hit' : 'miss', ms: 1, record: {}, raw: {} }]
		} as LookupResult;
	}
};
const kvStore = new Map<string, string>();
const kv = { get: async (k: string) => kvStore.get(k) ?? null, set: async (k: string, v: string) => (kvStore.set(k, v), 'OK'), del: async (k: string) => (kvStore.delete(k) ? 1 : 0), incr: async () => 1, expire: async () => 1 } as unknown as Kv;
const deleted: string[] = [];
const storage = { url: (k: string) => `/media/${k}`, put: async () => {}, delete: async (k: string) => void deleted.push(k) } as unknown as Storage;
const noQueue = { send: async () => null } as unknown as Queue;

describe.skipIf(!url)('accounts & sweep regressions (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 8 });
	const mailer: Mailer = { send: async () => {} };
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue: noQueue });
	const accounts = createAccounts(db, kv, { adminEmails: [], storage });
	const shelves = createShelves({ db, storage });
	const library = createLibrary({ db, catalog, accounts, storage, shelves });
	const notifications = createNotifications({ db, mailer, cfg: { origin: 'http://localhost' } });
	const social = createSocial({ db, kv, storage, notifications });
	const loans = createLoans({ db, storage, notifications });
	const posts = createPosts({ db, storage, notifications });
	const reading = createReading({ db, storage });
	const ids: Record<string, string> = {};

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions, tags cascade`);
		deleted.length = 0;
		for (const n of ['ann', 'ben', 'cat']) {
			const [u] = await db.insert(user).values({ name: n, email: `${n}@test.local` }).returning({ id: user.id });
			await accounts.bootstrap({ id: u!.id, name: n, email: `${n}@test.local` }, 'en');
			ids[n] = u!.id;
		}
	});
	const scan = async (who: string) => {
		const r = await library.scanAdd({ userId: ids[who]!, clientId: uuidv7(), code: '9780547928227' });
		if (r.status !== 'added') throw new Error('scan');
		return r;
	};

	it('purge after the grace period: sessions gone, avatar file deleted, loans kept for the other side', async () => {
		const hob = await scan('ann');
		await loans.lend(ids.ann!, { copyId: hob.copy.id, borrowerId: ids.ben!, dueOn: '2026-12-01' });
		const out = await loans.recordBorrow(ids.ben!, { workId: hob.book.workId, lenderName: 'Library' });
		await db.update(profiles).set({ avatarKey: 'avatars/ben/x.webp', displayName: 'Ben B' }).where(eq(profiles.userId, ids.ben!));
		await db.insert(session).values({ id: uuidv7(), token: 'tok-ben', userId: ids.ben!, expiresAt: new Date(Date.now() + 86_400_000) });
		kvStore.set('auth:tok-ben', '{}');

		await accounts.requestDeletion(ids.ben!);
		expect(await accounts.purgeDue()).toBe(0); // still in the grace period
		expect(await accounts.purgeDue(new Date(Date.now() + 15 * 86_400_000))).toBe(1);

		expect(await db.$count(user, eq(user.id, ids.ben!))).toBe(0);
		expect(kvStore.has('auth:tok-ben')).toBe(false);
		expect(deleted).toContain('avatars/ben/x.webp');
		// Ann's loan survives with Ben as a name; her copy is still "lent" and can be returned.
		const [l] = await db.select().from(loansTable).where(eq(loansTable.lenderId, ids.ann!));
		expect(l).toMatchObject({ borrowerId: null, borrowerName: 'Ben B', status: 'active' });
		expect(await loans.markReturned(ids.ann!, l!.id)).toBe('returned');
		expect((await db.query.copies.findFirst({ where: eq(copies.id, hob.copy.id) }))!.state).toBe('shelved');
		// Ben's own "borrowed from a library" row had nobody else in the app: it goes with him.
		expect(await db.$count(loansTable, eq(loansTable.id, out))).toBe(0);
	});

	it('an invite link works once, even when two people open it at the same time', async () => {
		const token = await shelves.createInvite(ids.ann!);
		const [a, b] = await Promise.all([shelves.acceptInvite(ids.ben!, token), shelves.acceptInvite(ids.cat!, token)]);
		expect([a, b].filter(Boolean)).toHaveLength(1);
		expect(await shelves.acceptInvite(ids.cat!, token)).toBeNull();
	});

	it('a scan retry with an id that is someone else’s copy is refused, not reported as mine', async () => {
		const ann = await scan('ann');
		const r = await library.scanAdd({ userId: ids.ben!, clientId: ann.copy.id, code: '9780547928227' });
		expect(r.status).toBe('invalid');
		const again = await library.scanAdd({ userId: ids.ann!, clientId: ann.copy.id, code: '9780547928227' });
		expect(again.status).toBe('added');
	});

	it('declining and re-sending a friend request notifies only once a day', async () => {
		for (let i = 0; i < 3; i++) {
			await social.requestFriend(ids.ben!, ids.ann!);
			await social.endFriendship(ids.ann!, ids.ben!);
		}
		expect(await db.$count(notifTable, and(eq(notifTable.userId, ids.ann!), eq(notifTable.type, 'friend_request')))).toBe(1);
	});

	it('deleting a post removes its likes and its comments’ likes', async () => {
		const p = await posts.create(ids.ann!, { body: 'hello', visibility: 'public' });
		const c = await posts.addComment(ids.ben!, p, { body: 'hi' });
		await posts.like(ids.ben!, 'post', p);
		await posts.like(ids.ann!, 'comment', c);
		expect(await db.$count(likes)).toBe(2);
		await posts.remove(ids.ann!, p);
		expect(await db.$count(likes)).toBe(0);
	});

	it('"Read" from a book card uses the reader’s local day (00:30 in Warsaw is not yesterday)', async () => {
		const hob = await scan('ann');
		await reading.setStatus(ids.ann!, hob.book.workId, 'reading', { now: new Date('2026-11-08T23:30:00Z') }); // 00:30 on 9 Nov in Warsaw
		await reading.setStatus(ids.ann!, hob.book.workId, 'read', { now: new Date('2026-11-08T23:40:00Z') });
		const [r] = await db.select().from(reads).where(eq(reads.userId, ids.ann!));
		expect(r).toMatchObject({ startedOn: '2026-11-09', finishedOn: '2026-11-09' });
		await db.update(profiles).set({ timezone: 'America/New_York' }).where(eq(profiles.userId, ids.ann!));
		await reading.setStatus(ids.ann!, hob.book.workId, 'reading', { now: new Date('2026-11-09T02:00:00Z') }); // 21:00 on 8 Nov in New York
		const open = await db.query.reads.findFirst({ where: and(eq(reads.userId, ids.ann!), eq(reads.outcome, 'in_progress')) });
		expect(open!.startedOn).toBe('2026-11-08');
	});
});
