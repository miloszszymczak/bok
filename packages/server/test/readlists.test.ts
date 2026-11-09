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


describe.skipIf(!url)('readlists (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 4 });
	const kv = memoryKv();
	const mailer: Mailer = { send: async () => {} };
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue: noQueue });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const notifications = createNotifications({ db, mailer, cfg: { origin: 'http://localhost' } });
	const social = createSocial({ db, kv, storage, notifications });
	const lists = createReadlists({ db, storage, notifications });
	const ids: Record<string, string> = {};
	const works: string[] = [];

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions cascade`);
		works.length = 0;
		for (const n of ['owner', 'other', 'blocked']) {
			const [u] = await db.insert(user).values({ name: n, email: `${n}@test.local` }).returning({ id: user.id });
			await accounts.bootstrap({ id: u!.id, name: n, email: `${n}@test.local` }, 'en');
			ids[n] = u!.id;
		}
		for (const code of ['9780547928227', '9788375780635', '9788378865759', '9788382251586']) {
			const r = await catalog.lookup(code);
			if (r.status === 'found') works.push(r.workId);
		}
	});

	const titles = async (slug: string) => (await lists.bySlug(ids.owner!, slug))!.items.map((i) => i.title);

	it('adds in order, ignores duplicates, and reorders by moving one item', async () => {
		const l = await lists.create(ids.owner!, { title: 'Na wakacje' });
		for (const w of works) await lists.addItem(ids.owner!, l.id, w);
		expect(await lists.addItem(ids.owner!, l.id, works[0]!)).toBeNull();
		expect(await titles(l.slug)).toEqual(['The Hobbit', 'Ostatnie życzenie', 'Bóg i geometria', 'Jak człowiek staje się mordercą']);
		const items = (await lists.bySlug(ids.owner!, l.slug))!.items;
		await lists.move(ids.owner!, l.id, items[3]!.id, null); // last → top
		await lists.move(ids.owner!, l.id, items[0]!.id, items[2]!.id); // Hobbit → after Bóg
		expect(await titles(l.slug)).toEqual(['Jak człowiek staje się mordercą', 'Ostatnie życzenie', 'Bóg i geometria', 'The Hobbit']);
		await lists.setNote(ids.owner!, l.id, items[1]!.id, 'Zacznij od tego');
		expect((await lists.bySlug(null, l.slug))).toBeNull(); // still private
		await expect(lists.addItem(ids.other!, l.id, works[0]!)).rejects.toThrow();
	});

	it('visibility: private / unlisted / public', async () => {
		const priv = await lists.create(ids.owner!, { title: 'P', visibility: 'private' });
		const unl = await lists.create(ids.owner!, { title: 'U', visibility: 'unlisted' });
		const pub = await lists.create(ids.owner!, { title: 'Pub', visibility: 'public' });
		for (const viewer of [null, ids.other!]) {
			expect(await lists.bySlug(viewer, priv.slug)).toBeNull();
			expect(await lists.bySlug(viewer, unl.slug)).not.toBeNull();
			expect(await lists.bySlug(viewer, pub.slug)).not.toBeNull();
			expect((await lists.onProfile(ids.owner!, viewer)).map((x) => x.title)).toEqual(['Pub']);
		}
		expect((await lists.onProfile(ids.owner!, ids.owner!)).length).toBe(3);
		await social.block(ids.owner!, ids.blocked!);
		expect(await lists.bySlug(ids.blocked!, pub.slug)).toBeNull();
	});

	it('saving: not own, not private; notifies the owner; unlisted lists can be saved', async () => {
		const unl = await lists.create(ids.owner!, { title: 'U', visibility: 'unlisted' });
		const priv = await lists.create(ids.owner!, { title: 'P' });
		await lists.save(ids.other!, unl.id);
		await expect(lists.save(ids.other!, priv.id)).rejects.toThrow();
		await expect(lists.save(ids.owner!, unl.id)).rejects.toThrow();
		expect((await lists.saved(ids.other!)).map((x) => x.title)).toEqual(['U']);
		expect((await lists.bySlug(ids.other!, unl.slug))?.saved).toBe(true);
		expect(await notifications.unread(ids.owner!)).toBe(1);
		await lists.update(ids.owner!, unl.id, { visibility: 'private' });
		expect(await lists.saved(ids.other!)).toEqual([]); // made private again → gone from saved
	});

	it('the add-to-list sheet knows where a work already is', async () => {
		const a = await lists.create(ids.owner!, { title: 'A' });
		await lists.create(ids.owner!, { title: 'B' });
		await lists.addItem(ids.owner!, a.id, works[0]!);
		const sheet = await lists.forWork(ids.owner!, works[0]!);
		expect(sheet.map((x) => [x.title, x.has]).sort()).toEqual([['A', true], ['B', false]]);
	});
});
