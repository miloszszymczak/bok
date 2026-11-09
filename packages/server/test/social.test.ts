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


// Same matrix as packages/core/src/visibility.test.ts (the TS twin of can_view).
const EXPECTED: Record<string, string[]> = {
	public: ['anonymous', 'stranger', 'follower', 'friend', 'friend+follower', 'self'],
	followers: ['follower', 'friend', 'friend+follower', 'self'],
	friends: ['friend', 'friend+follower', 'self'],
	private: ['self']
};
const VIS = ['public', 'followers', 'friends', 'private'] as const;
const CODES = { public: '9780547928227', followers: '9788375780635', friends: '9788378865759', private: '9788382251586' } as const;

describe.skipIf(!url)('social (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 4 });
	const kv = memoryKv();
	const sent: string[] = [];
	const mailer: Mailer = { send: async (m) => void sent.push(m.subject) };
	const vapid = webpush.generateVAPIDKeys();
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue: noQueue });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const reading = createReading({ db, storage });
	const shelves = createShelves({ db, storage });
	const library = createLibrary({ db, catalog, accounts, storage, shelves });
	const notifications = createNotifications({ db, mailer, cfg: { vapid: { ...vapid, subject: 'mailto:test@bok.local' }, origin: 'http://localhost' } });
	const social = createSocial({ db, kv, storage, notifications });
	const ids: Record<string, string> = {};

	async function mk(name: string) {
		const [u] = await db.insert(user).values({ name, email: `${name.replace(/\W/g, '')}@test.local` }).returning({ id: user.id });
		await accounts.bootstrap({ id: u!.id, name, email: `${name.replace(/\W/g, '')}@test.local` }, 'en');
		ids[name] = u!.id;
		return u!.id;
	}

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions cascade`);
		const owner = await mk('owner');
		for (const n of ['stranger', 'follower', 'friend', 'friend+follower', 'blocked']) await mk(n);
		await social.follow(ids.follower!, owner);
		await social.follow(ids['friend+follower']!, owner);
		for (const f of ['friend', 'friend+follower']) {
			await social.requestFriend(ids[f]!, owner);
			await social.acceptFriend(owner, ids[f]!);
		}
		await social.follow(ids.blocked!, owner);
		await social.block(owner, ids.blocked!);
		// One finished read per visibility, and one owned copy for the library.
		for (const vis of VIS) {
			const r = await catalog.lookup(CODES[vis]);
			if (r.status !== 'found') throw new Error('fixture');
			await reading.finish(owner, r.workId, { date: '2026-03-01', precision: 'day', visibility: vis });
		}
		await library.scanAdd({ userId: owner, clientId: uid(), code: CODES.public });
	});

	const viewers = () => ({ anonymous: null, stranger: ids.stranger!, follower: ids.follower!, friend: ids.friend!, 'friend+follower': ids['friend+follower']!, blocked: ids.blocked!, self: ids.owner! });

	it('log visibility matrix matches can_view expectations', async () => {
		for (const vis of VIS) {
			const title = (await catalog.lookup(CODES[vis]).then((r) => (r.status === 'found' ? r.workId : '')));
			const seeing: string[] = [];
			for (const [name, viewerId] of Object.entries(viewers())) {
				const log = await reading.log(ids.owner!, { viewerId });
				if (log.some((e) => e.workId === title)) seeing.push(name);
			}
			expect(seeing, vis).toEqual(EXPECTED[vis]);
		}
	});

	it('library visibility matrix', async () => {
		for (const vis of VIS) {
			await db.update(profiles).set({ libraryVisibility: vis }).where(eq(profiles.userId, ids.owner!));
			const seeing: string[] = [];
			for (const [name, viewerId] of Object.entries(viewers())) if ((await shelves.publicLibrary(viewerId, ids.owner!))?.length) seeing.push(name);
			expect(seeing, vis).toEqual(EXPECTED[vis]);
		}
	});

	it('blocking removes the relationship and hides the profile from the blocked user', async () => {
		expect(await db.select().from(follows).where(eq(follows.followerId, ids.blocked!))).toHaveLength(0);
		expect(await social.profile(ids.blocked!, 'blocked')).not.toBeNull(); // they can see their own
		const h = (await db.query.profiles.findFirst({ where: eq(profiles.userId, ids.owner!) }))!.handle;
		expect(await social.profile(ids.blocked!, h)).toBeNull();
		await expect(social.follow(ids.blocked!, ids.owner!)).rejects.toThrow();
		await expect(social.requestFriend(ids.blocked!, ids.owner!)).rejects.toThrow();
		expect((await social.search(ids.blocked!, 'owner')).length).toBe(0);
		expect((await social.search(ids.stranger!, 'owner')).map((p) => p.handle)).toEqual([h]);
	});

	it('friend requests: mutual request auto-accepts; followers and friends are independent', async () => {
		expect(await social.requestFriend(ids.stranger!, ids.follower!)).toBe('requested');
		expect((await social.relationship(ids.follower!, ids.stranger!)).friend).toBe('incoming');
		expect(await social.requestFriend(ids.follower!, ids.stranger!)).toBe('friends');
		const rel = await social.relationship(ids.friend!, ids.owner!);
		expect(rel).toMatchObject({ friend: 'friends', following: false });
	});

	it('delivers a friend-request push in under 5 seconds (VAPID-signed, encrypted)', { timeout: 15_000 }, async () => {
		// Push services are HTTPS-only, so the fake one gets a throwaway self-signed certificate.
		const dir = mkdtempSync(join(tmpdir(), 'bok-push-'));
		execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		const received: { at: number; headers: Record<string, string | string[] | undefined>; bytes: number }[] = [];
		const server = createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
			const chunks: Buffer[] = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => {
				received.push({ at: Date.now(), headers: req.headers, bytes: Buffer.concat(chunks).length });
				res.statusCode = 201;
				res.end();
			});
		});
		await new Promise<void>((r) => server.listen(0, r));
		const port = (server.address() as { port: number }).port;
		const ecdh = createECDH('prime256v1');
		ecdh.generateKeys();
		await notifications.subscribe(ids.stranger!, {
			endpoint: `https://127.0.0.1:${port}/push/abc`,
			keys: { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') }
		});
		const t0 = Date.now();
		await social.requestFriend(ids.owner!, ids.stranger!);
		while (!received.length && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 25));
		server.close();
		delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
		expect(received.length).toBe(1);
		expect(received[0]!.at - t0).toBeLessThan(5000);
		expect(String(received[0]!.headers.authorization)).toMatch(/^vapid t=/);
		expect(received[0]!.headers['content-encoding']).toBe('aes128gcm');
		expect(received[0]!.bytes).toBeGreaterThan(100);
		expect(await notifications.unread(ids.stranger!)).toBe(1);
		expect(sent).toContain('Friend request'); // email channel on by default for friend requests
	});

	it('respects preferences and suppresses notifications from blocked users', async () => {
		const before = await notifications.unread(ids.owner!);
		await notifications.setPrefs(ids.owner!, [{ type: 'follow', inapp: false, push: false, email: false }]);
		await social.follow(ids.stranger!, ids.owner!);
		expect(await notifications.unread(ids.owner!)).toBe(before);
		expect(await notifications.notify(ids.owner!, 'friend_request', { actorId: ids.blocked! })).toBeNull();
	});

	it('suspension hides the profile and resolves related reports', async () => {
		const h = (await db.query.profiles.findFirst({ where: eq(profiles.userId, ids.stranger!) }))!.handle;
		await social.report(ids.owner!, { targetType: 'profile', targetId: ids.stranger!, targetUserId: ids.stranger!, reason: 'spam', details: 'x' });
		await social.report(ids.friend!, { targetType: 'profile', targetId: ids.stranger!, targetUserId: ids.stranger!, reason: 'abuse', details: '' });
		const open = await social.openReports();
		expect(open).toHaveLength(2);
		await social.resolve(ids.owner!, open[0]!.id, 'suspend');
		expect(await social.openReports()).toHaveLength(0);
		expect(await social.profile(ids.follower!, h)).toBeNull();
		expect(await social.isSuspended(ids.stranger!)).toBe(true);
		await social.restore(ids.stranger!);
		expect(await social.profile(ids.follower!, h)).not.toBeNull();
	});
});
