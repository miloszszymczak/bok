/**
 * Import integration tests (real Postgres; TEST_DATABASE_URL). Includes the phase-9 criteria:
 * a 1,200-row Goodreads-format file with simulated provider latency imports in under 2 minutes
 * with ≥ 95 % matched automatically, and a lubimyczytac export keeps its 1–10 ratings.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODREADS_HEADER, parseImportFile, toCsv } from '@bok/core';
import { copies, createDb, readingStates, reads, user, userWorkTags } from '@bok/db';
import { runMigrations } from '@bok/db/migrate';
import type { LookupResult, MetadataClient } from '@bok/metadata';
import { and, eq, sql } from 'drizzle-orm';
import { createAccounts } from '../src/accounts.ts';
import { createCatalog } from '../src/catalog.ts';
import { createCatalogEditor } from '../src/catalog-edit.ts';
import { createShelves } from '../src/shelves.ts';
import { createLibrary } from '../src/library.ts';
import { createNotifications } from '../src/notifications.ts';
import { createReading } from '../src/reading.ts';
import { createTagging } from '../src/tagging.ts';
import { createReadlists } from '../src/readlists.ts';
import { createImports } from '../src/imports.ts';
import { createExports } from '../src/exports.ts';
import type { Mailer } from '../src/email.ts';
import type { Queue } from '../src/queue.ts';
import type { Storage } from '../src/storage.ts';
import type { Kv } from '../src/valkey.ts';

const url = process.env.TEST_DATABASE_URL;

/** Valid ISBN-13 from a 978-83 prefix + counter. */
function isbn(n: number) {
	const body = `97883${String(n).padStart(7, '0')}`;
	const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
	return body + ((10 - (sum % 10)) % 10);
}
/** Providers know 90 % of the generated ISBNs, each lookup takes ~150 ms. */
const known = (code: string) => Number(code.slice(5, 12)) % 10 !== 0;
const fakeMetadata: MetadataClient = {
	providers: ['openlibrary'],
	async lookup(id) {
		await new Promise((r) => setTimeout(r, 150));
		const code = id.kind === 'isbn' ? id.isbn13 : '';
		const hit = code === '9780547928227' ? { title: 'The Hobbit', author: 'J.R.R. Tolkien' } : code && known(code) ? { title: `Book ${code}`, author: `Author ${code.slice(-3)}` } : null;
		return {
			identifier: id,
			merged: hit ? { title: hit.title, contributors: [{ name: hit.author, role: 'author' }], pageCount: 250 } : null,
			quality: hit ? 50 : 0,
			results: [{ provider: 'openlibrary', status: hit ? 'hit' : 'miss', ms: 150, record: {}, raw: {} }]
		} as LookupResult;
	}
};
const kv = (() => {
	const m = new Map<string, string>();
	return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => (m.set(k, v), 'OK'), del: async (k: string) => (m.delete(k), 1), incr: async () => 1, expire: async () => 1 } as unknown as Kv;
})();
const sent: string[] = [];
const queue = { send: async (_q: string, d: { importId: string }) => (sent.push(d.importId), 'job') } as unknown as Queue;
const storage = { url: (k: string) => `/media/${k}`, put: async () => {} } as unknown as Storage;

describe.skipIf(!url)('imports (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 16 });
	const mailer: Mailer = { send: async () => {} };
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const editor = createCatalogEditor(db, catalog, storage);
	const shelves = createShelves({ db, storage });
	const library = createLibrary({ db, catalog, accounts, storage, shelves });
	const notifications = createNotifications({ db, mailer, cfg: { origin: 'http://localhost' } });
	const reading = createReading({ db, storage });
	const tagging = createTagging({ db, storage });
	const readlists = createReadlists({ db, storage, notifications });
	const imports = createImports({ db, catalog, editor, reading, tagging, readlists, library, queue, notifications });
	const exportsSvc = createExports({ db });
	let me = '';

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions, tags cascade`);
		const [u] = await db.insert(user).values({ name: 'me', email: 'me@test.local' }).returning({ id: user.id });
		await accounts.bootstrap({ id: u!.id, name: 'me', email: 'me@test.local' }, 'en');
		me = u!.id;
	});

	const gr = (rows: Record<string, string | number>[]) => toCsv([GOODREADS_HEADER, ...rows.map((r) => GOODREADS_HEADER.map((h) => r[h] ?? ''))]);
	const finishedReads = (workId?: string) => db.$count(reads, and(eq(reads.userId, me), eq(reads.outcome, 'finished'), workId ? eq(reads.workId, workId) : undefined));

	it('maps a Goodreads export: status, rating, date, re-reads, review, shelves → tags, owned → Unsorted; re-import adds nothing', async () => {
		const file = gr([
			{ Title: 'The Hobbit (Middle-earth, #1)', Author: 'J.R.R. Tolkien', ISBN13: '="9780547928227"', 'My Rating': 4, 'Date Read': '2023/05/14', Bookshelves: 'fantasy, classics', 'Exclusive Shelf': 'read', 'My Review': 'Great', 'Read Count': 2, 'Owned Copies': 1, 'Number of Pages': 300 },
			{ Title: 'Unknown Book', Author: 'Nobody Known', 'Exclusive Shelf': 'to-read' },
			{ Title: 'Reading Now', Author: 'Someone', ISBN13: `="${isbn(10)}"`, 'Exclusive Shelf': 'currently-reading' }
		]);
		const id = await imports.upload(me, 'goodreads_library_export.csv', file);
		const pv = await imports.preview(me, id);
		expect(pv.summary).toMatchObject({ total: 3, withIsbn: 2, read: 1, reading: 1, wantToRead: 1, owned: 1 });
		expect((await imports.get(me, id)).options.ratingScale).toBe(5);
		await imports.confirm(me, id, {});
		expect(sent).toContain(id);
		await imports.run(id);
		const st = await imports.get(me, id);
		expect(st.status).toBe('done');
		expect(st.stats).toMatchObject({ total: 3, processed: 3, failed: 0, review: 0 });

		const hob = (await catalog.lookup('9780547928227')) as { workId: string };
		const rs = await db.select().from(reads).where(and(eq(reads.userId, me), eq(reads.workId, hob.workId))).orderBy(reads.finishedOn);
		expect(rs).toHaveLength(2);
		const dated = rs.find((r) => r.finishedOn)!;
		expect(dated).toMatchObject({ finishedOn: '2023-05-14', rating: 8, review: 'Great', total: 300, finishedAt: null });
		expect((await db.query.readingStates.findFirst({ where: and(eq(readingStates.userId, me), eq(readingStates.workId, hob.workId)) }))!.status).toBe('read');
		expect(await db.$count(userWorkTags, eq(userWorkTags.userId, me))).toBe(2);
		expect(await db.$count(copies)).toBe(1);
		const states = await db.select({ s: readingStates.status }).from(readingStates).where(eq(readingStates.userId, me));
		expect(states.map((s) => s.s).sort()).toEqual(['read', 'reading', 'want_to_read']);

		// Same file again → nothing new.
		const again = await imports.upload(me, 'again.csv', file);
		await imports.confirm(me, again, {});
		await imports.run(again);
		expect(await finishedReads()).toBe(2);
		expect(await db.$count(copies)).toBe(1);
		expect(await db.$count(readingStates, eq(readingStates.userId, me))).toBe(3);
	});

	it('exports a Goodreads CSV that imports back to the same data, and a full JSON dump', async () => {
		const file = gr([
			{ Title: 'The Hobbit', Author: 'J.R.R. Tolkien', ISBN13: '="9780547928227"', 'My Rating': 4, 'Date Read': '2023/05/14', Bookshelves: 'fantasy', 'Exclusive Shelf': 'read', 'Read Count': 1, 'Owned Copies': 1 },
			{ Title: 'Later', Author: 'Some One', ISBN13: `="${isbn(30)}"`, 'Exclusive Shelf': 'to-read' }
		]);
		const id = await imports.upload(me, 'a.csv', file);
		await imports.confirm(me, id, {});
		await imports.run(id);
		const csv = await exportsSvc.goodreadsCsv(me);
		const back = parseImportFile(csv);
		expect(back.source).toBe('goodreads');
		const hob = back.rows.find((r) => r.isbn13 === '9780547928227')!;
		expect(hob).toMatchObject({ title: 'The Hobbit', authors: ['J.R.R. Tolkien'], rating: 4, shelf: 'read', dateRead: '2023-05-14', shelves: ['fantasy'], readCount: 1, owned: 1 });
		expect(back.rows.find((r) => r.isbn13 === isbn(30))).toMatchObject({ shelf: 'want_to_read' });
		const json = await exportsSvc.fullJson(me);
		expect(json.reads).toHaveLength(1);
		expect(json.copies).toHaveLength(1);
		expect((json.profile as { user_id: string }).user_id).toBe(me);
		expect(JSON.stringify(json)).not.toContain('"password"');
	});

	it('rows without ISBN: exact title + author matches, fuzzy ones wait for review', async () => {
		await catalog.lookup('9780547928227'); // "The Hobbit" by J.R.R. Tolkien is in the catalogue
		const id = await imports.upload(me, 'x.csv', gr([
			{ Title: 'The Hobbit: or There and Back Again', Author: 'J.R.R. Tolkien', 'Exclusive Shelf': 'read' },
			{ Title: 'Hobbit', Author: 'Tolkien', 'Exclusive Shelf': 'read', 'My Rating': 5 }
		]));
		await imports.confirm(me, id, {});
		await imports.run(id);
		expect((await imports.get(me, id)).stats).toMatchObject({ matched: 1, review: 1 });
		const [rv] = await imports.reviewRows(me, id);
		expect(rv!.candidates[0]!.title).toBe('The Hobbit');
		await imports.resolve(me, id, rv!.id, { workId: rv!.candidates[0]!.workId });
		expect((await imports.get(me, id)).stats).toMatchObject({ matched: 2, review: 0 });
		expect(await finishedReads()).toBe(1); // both rows are the same book, no date → one read
	});

	it('lubimyczytac export: ratings stay on the 1–10 scale, Polish shelves map to statuses', async () => {
		const id = await imports.upload(me, 'lubimyczytac.csv', `Tytuł;Autor;ISBN;Moja ocena;Półka;Data przeczytania\nKsiążka;Autor Polski;${isbn(21)};7;Przeczytane;2022-08-01\nInna;Autor Drugi;${isbn(22)};9;przeczytane;\n`);
		const g = await imports.get(me, id);
		expect(g.source).toBe('lubimyczytac');
		expect(g.options.ratingScale).toBe(10);
		await imports.confirm(me, id, { shelvesAs: 'readlists' });
		await imports.run(id);
		const ratings = (await db.select({ r: reads.rating }).from(reads).where(eq(reads.userId, me))).map((x) => x.r).sort();
		expect(ratings).toEqual([7, 9]);
	});

	it('1,200 rows with ~150 ms provider lookups: under 2 minutes, ≥ 95 % matched automatically', async () => {
		const rows: Record<string, string | number>[] = [];
		for (let i = 0; i < 1200; i++) {
			const noIsbn = i % 40 === 0; // 2.5 % without ISBN (title + author only)
			rows.push({
				Title: noIsbn ? `Rare Title ${i}` : `Title ${i}`,
				Author: `Writer ${i % 300}`,
				ISBN13: noIsbn ? '=""' : `="${isbn(1000 + i)}"`,
				'My Rating': i % 6,
				'Date Read': i % 3 ? `20${10 + (i % 14)}/0${1 + (i % 9)}/1${i % 9}` : '',
				'Exclusive Shelf': i % 3 ? 'read' : i % 2 ? 'to-read' : 'currently-reading',
				Bookshelves: i % 5 ? '' : 'favourites',
				'Number of Pages': 200 + (i % 300),
				'Read Count': i % 3 ? 1 : 0,
				'Owned Copies': i % 4 ? 0 : 1
			});
		}
		const t0 = Date.now();
		const id = await imports.upload(me, 'big.csv', gr(rows));
		await imports.confirm(me, id, {});
		await imports.run(id);
		const ms = Date.now() - t0;
		const st = (await imports.get(me, id)).stats;
		const auto = (st.matched + st.created) / st.total;
		console.log(`1200 rows in ${(ms / 1000).toFixed(1)} s, auto-matched ${(auto * 100).toFixed(1)} %`, st);
		expect(st.processed).toBe(1200);
		expect(st.failed).toBe(0);
		expect(ms).toBeLessThan(120_000);
		expect(auto).toBeGreaterThanOrEqual(0.95);
	}, 180_000);
});
