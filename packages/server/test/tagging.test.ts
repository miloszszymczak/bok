/** Tags and series (real Postgres; TEST_DATABASE_URL). */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, user, works } from '@bok/db';
import { runMigrations } from '@bok/db/migrate';
import { sql } from 'drizzle-orm';
import { createAccounts } from '../src/accounts.ts';
import { createReading } from '../src/reading.ts';
import { createTagging, seriesPosition } from '../src/tagging.ts';
import type { Storage } from '../src/storage.ts';
import type { Kv } from '../src/valkey.ts';

const url = process.env.TEST_DATABASE_URL;
const kv = { get: async () => null, set: async () => 'OK', del: async () => 1 } as unknown as Kv;
const storage = { url: (k: string) => `/media/${k}` } as unknown as Storage;

describe('seriesPosition', () => {
	it('reads positions from catalogue strings', () => {
		expect(seriesPosition('Tom 3')).toBe(3);
		expect(seriesPosition('#1.5')).toBe(1.5);
		expect(seriesPosition('2,5')).toBe(2.5);
		expect(seriesPosition('')).toBeNull();
		expect(seriesPosition(null)).toBeNull();
	});
});

describe.skipIf(!url)('tags & series (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 4 });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const tagging = createTagging({ db, storage });
	const reading = createReading({ db, storage });
	const ids: Record<string, string> = {};
	const w: Record<string, string> = {};

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions, tags, series cascade`);
		for (const n of ['ann', 'ben']) {
			const [u] = await db.insert(user).values({ name: n, email: `${n}@test.local` }).returning({ id: user.id });
			await accounts.bootstrap({ id: u!.id, name: n, email: `${n}@test.local` }, 'en');
			ids[n] = u!.id;
		}
		for (const [k, title, year] of [['one', 'Ostatnie życzenie', 1993], ['two', 'Miecz przeznaczenia', 1992], ['three', 'Krew elfów', 1994]] as const) {
			const [row] = await db.insert(works).values({ title, foldedTitle: title.toLowerCase(), firstPublishedYear: year }).returning({ id: works.id });
			w[k] = row!.id;
		}
	});

	it('tags: add (idempotent, # stripped, same slug shared), mine, forWork with community counts, suggest, remove', async () => {
		const t = await tagging.add(ids.ann!, w.one!, '#Fantastyka ');
		expect(t).toMatchObject({ slug: 'fantastyka', name: 'Fantastyka' });
		await tagging.add(ids.ann!, w.one!, 'fantastyka');
		await tagging.add(ids.ann!, w.two!, 'Fantastyka');
		await tagging.add(ids.ben!, w.one!, 'FANTASTYKA');
		await tagging.add(ids.ben!, w.one!, 'polska');
		expect(await tagging.add(ids.ann!, w.one!, '###')).toBeNull();
		expect(await tagging.mine(ids.ann!)).toEqual([{ slug: 'fantastyka', name: 'Fantastyka', count: 2 }]);
		const fw = await tagging.forWork(ids.ann!, w.one!);
		expect(fw.mine.map((x) => x.slug)).toEqual(['fantastyka']);
		expect(fw.community.find((x) => x.slug === 'fantastyka')!.count).toBe(2);
		expect((await tagging.suggest('fan')).map((x) => x.slug)).toEqual(['fantastyka']);
		await tagging.remove(ids.ann!, w.one!, 'fantastyka');
		expect((await tagging.forWork(ids.ann!, w.one!)).mine).toEqual([]);
		expect((await tagging.bySlug('polska'))?.name).toBe('polska');
	});

	it('series: positions order the works, my statuses are shown, setSeries moves a work', async () => {
		await tagging.setSeries(w.one!, 'Wiedźmin', 'Tom 1');
		await tagging.setSeries(w.two!, 'wiedźmin', '2');
		await tagging.setSeries(w.three!, 'Wiedźmin', null);
		await reading.setStatus(ids.ann!, w.two!, 'want_to_read');
		const [s] = await tagging.seriesForWork(ids.ann!, w.one!);
		expect(s!.name).toBe('Wiedźmin');
		expect(s!.works.map((x) => [x.title, x.position, x.status])).toEqual([
			['Ostatnie życzenie', 1, null],
			['Miecz przeznaczenia', 2, 'want_to_read'],
			['Krew elfów', null, null]
		]);
		await tagging.setSeries(w.three!, 'Saga', '1');
		expect((await tagging.seriesForWork(null, w.one!))[0]!.works).toHaveLength(2);
		await tagging.setSeries(w.three!, null, null);
		expect(await tagging.seriesForWork(null, w.three!)).toEqual([]);
	});
});
