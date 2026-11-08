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
import { groupLog } from '@bok/core';
import { createCatalog } from '../src/catalog.ts';
import { createReading } from '../src/reading.ts';

import type { Queue } from '../src/queue.ts';
import type { Storage } from '../src/storage.ts';
import type { Kv } from '../src/valkey.ts';

const url = process.env.TEST_DATABASE_URL;

const BOOKS: Record<string, { title: string; author: string; work?: string }> = {
	'9788375780635': { title: 'Ostatnie życzenie', author: 'Andrzej Sapkowski', work: '/works/OL1W' },
	'9788370540289': { title: 'Ostatnie życzenie', author: 'Andrzej Sapkowski', work: '/works/OL1W' }, // another edition
	'9780547928227': { title: 'The Hobbit', author: 'J.R.R. Tolkien' }
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

const DAY = 86_400_000;

describe.skipIf(!url)('reading (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 4 });
	const kv = memoryKv();
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue: noQueue });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const reading = createReading({ db, storage });
	let alice = '';
	let hobbit = '';
	let sap = '';

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions cascade`);
		const [u] = await db.insert(user).values({ name: 'Alice', email: 'alice@test.local' }).returning({ id: user.id });
		alice = u!.id;
		await accounts.bootstrap({ id: alice, name: 'Alice', email: 'alice@test.local' }, 'pl');
		const h = await catalog.lookup('9780547928227');
		const s = await catalog.lookup('9788375780635');
		hobbit = h.status === 'found' ? h.workId : '';
		sap = s.status === 'found' ? s.workId : '';
	});

	it('reading → stuck after 31 quiet days; progress clears an automatic stuck', async () => {
		const t0 = new Date('2026-03-01T10:00:00Z');
		await reading.setStatus(alice, hobbit, 'reading', { now: t0 });
		const { current } = await reading.forWork(alice, hobbit);
		expect(await reading.markStuck(new Date(t0.getTime() + 29 * DAY))).toBe(0);
		expect(await reading.markStuck(new Date(t0.getTime() + 31 * DAY))).toBe(1);
		expect(await reading.forWork(alice, hobbit)).toMatchObject({ status: 'stuck', stuckSource: 'auto' });
		await reading.progress(alice, current!.id, { progress: 120 }, new Date(t0.getTime() + 32 * DAY));
		const after = await reading.forWork(alice, hobbit);
		expect(after).toMatchObject({ status: 'reading', stuckSource: null });
		expect(after.events.map((e) => e.type)).toEqual(['started', 'stuck', 'progress', 'resumed']);
		// New activity restarts the 30-day window.
		expect(await reading.markStuck(new Date(t0.getTime() + 50 * DAY))).toBe(0);
	});

	it('manual stuck survives progress until the status changes', async () => {
		await reading.setStatus(alice, hobbit, 'reading');
		await reading.setStatus(alice, hobbit, 'stuck');
		const { current } = await reading.forWork(alice, hobbit);
		await reading.progress(alice, current!.id, { progress: 50 });
		expect(await reading.forWork(alice, hobbit)).toMatchObject({ status: 'stuck', stuckSource: 'manual' });
		await reading.setStatus(alice, hobbit, 'reading');
		expect((await reading.forWork(alice, hobbit)).status).toBe('reading');
	});

	it('estimates reading time from events, and an override replaces it', async () => {
		const t0 = new Date('2026-03-01T10:00:00Z');
		await reading.setStatus(alice, hobbit, 'reading', { now: t0 });
		const id = await reading.finish(alice, hobbit, { date: '2026-03-15', precision: 'day', rating: 9 }, new Date('2026-03-15T21:00:00Z'));
		expect((await reading.read(alice, id)).estimatedDays).toBe(14);
		await reading.updateRead(alice, id, { durationDaysOverride: 20 });
		const r = await reading.read(alice, id);
		expect(r.read.durationDaysOverride).toBe(20);
		expect((await reading.forWork(alice, hobbit)).past[0]).toMatchObject({ durationDaysOverride: 20, estimatedDays: 14, rating: 9 });
	});

	it('undated reads go to Past, month-only to that month; rereads are counted', async () => {
		await reading.finish(alice, hobbit, { date: null, precision: null });
		await reading.finish(alice, sap, { date: '2026-02', precision: 'month', rating: 7 });
		await reading.setStatus(alice, hobbit, 'reading');
		await reading.finish(alice, hobbit, { date: '2026-04-02', precision: 'day' });
		const log = await reading.log(alice);
		const groups = groupLog(log);
		expect(groups.map((g) => [g.year, g.months.map((m) => [m.month, m.entries.map((e) => e.title)])])).toEqual([
			[2026, [[4, ['The Hobbit']], [2, ['Ostatnie życzenie']]]],
			[null, [[null, ['The Hobbit']]]]
		]);
		expect(log.find((e) => e.finishedOn === '2026-04-02')?.readNumber).toBe(2);
		expect(await reading.finishedInYear(alice, 2026)).toBe(2);
		expect(await reading.summaries(alice, [hobbit])).toEqual([{ workId: hobbit, status: 'read', timesRead: 2, lastRating: null }]);
	});

	it('want → reading → dnf, deleting reads recomputes the status', async () => {
		await reading.setStatus(alice, sap, 'want_to_read');
		expect((await reading.forWork(alice, sap)).current).toBeNull();
		await reading.setStatus(alice, sap, 'reading');
		await reading.setStatus(alice, sap, 'dnf');
		const st = await reading.forWork(alice, sap);
		expect(st).toMatchObject({ status: 'dnf', current: null });
		await reading.deleteRead(alice, st.past[0]!.id);
		expect((await reading.forWork(alice, sap)).status).toBeNull();
	});

	it('keeps goals per year', async () => {
		await reading.setGoal(alice, 2026, 24);
		expect(await reading.goal(alice, 2026)).toBe(24);
		await reading.setGoal(alice, 2026, null);
		expect(await reading.goal(alice, 2026)).toBeNull();
	});
});
