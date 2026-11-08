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
import { createCatalog } from '../src/catalog.ts';
import { createCatalogEditor } from '../src/catalog-edit.ts';
import { createLibrary } from '../src/library.ts';
import { createShelves } from '../src/shelves.ts';
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

describe.skipIf(!url)('library (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 4 });
	const kv = memoryKv();
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue: noQueue });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const shelves = createShelves({ db, storage });
	const library = createLibrary({ db, catalog, accounts, storage, shelves });
	const editor = createCatalogEditor(db, catalog, storage);
	let alice = '';
	let bob = '';

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions cascade`);
		for (const name of ['Alice', 'Bob']) {
			const [u] = await db.insert(user).values({ name, email: `${name.toLowerCase()}@test.local` }).returning({ id: user.id });
			await accounts.bootstrap({ id: u!.id, name, email: `${name}@test.local` }, 'pl');
			if (name === 'Alice') alice = u!.id;
			else bob = u!.id;
		}
	});

	it('adds a scanned book and is idempotent for the same client id', async () => {
		const id = uuidv7();
		const a = await library.scanAdd({ userId: alice, clientId: id, code: '978-83-7578-063-5' });
		expect(a).toMatchObject({ status: 'added', copy: { id }, book: { title: 'Ostatnie życzenie', authors: ['Andrzej Sapkowski'] } });
		const again = await library.scanAdd({ userId: alice, clientId: id, code: '9788375780635' });
		expect(again.status).toBe('added');
		expect(await library.snapshot(alice)).toHaveLength(1);
		expect((await library.snapshot(alice))[0]!.copies).toHaveLength(1);
	});

	it('reports duplicates unless forced', async () => {
		await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9788375780635' });
		const dup = await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9788375780635' });
		expect(dup).toMatchObject({ status: 'duplicate', copies: [{ state: 'shelved' }] });
		const forced = await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9788375780635', force: true });
		expect(forced).toMatchObject({ status: 'added', otherCopies: 1 });
		expect((await library.snapshot(alice))[0]!.copies).toHaveLength(2);
	});

	it('flags another edition of the same work', async () => {
		await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9788375780635' });
		const other = await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9788370540289' });
		expect(other).toMatchObject({ status: 'added', sameWorkOtherEditions: 1 });
		const check = await library.check(alice, '9788370540289');
		expect(check.copies).toHaveLength(1);
	});

	it('keeps households separate', async () => {
		await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9780547928227' });
		const b = await library.scanAdd({ userId: bob, clientId: uuidv7(), code: '9780547928227' });
		expect(b.status).toBe('added');
		expect(await library.check(bob, '9780547928227')).toMatchObject({ status: 'found', copies: [{}] });
	});

	it('undo removes only own copies and is idempotent', async () => {
		const id = uuidv7();
		await library.scanAdd({ userId: alice, clientId: id, code: '9780547928227' });
		expect(await library.removeCopy(bob, id)).toBe(false);
		expect(await library.removeCopy(alice, id)).toBe(true);
		expect(await library.removeCopy(alice, id)).toBe(false);
		expect(await library.snapshot(alice)).toHaveLength(0);
	});

	it('reports unknown and invalid codes', async () => {
		expect(await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9781234567897' })).toEqual({ status: 'not_found' });
		expect(await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '123' })).toEqual({ status: 'invalid' });
		expect(await library.scanAdd({ userId: alice, clientId: 'nope', code: '9780547928227' })).toEqual({ status: 'invalid' });
	});

	it('creates manual books, edits them and logs the diff', async () => {
		const r = await editor.createManual({ title: 'Pamiętnik babci', authors: ['Zofia Nowak'], year: 1952 }, alice);
		expect(r.existed).toBe(false);
		const hits = await catalog.search('pamietnik');
		expect(hits[0]?.title).toBe('Pamiętnik babci');
		await editor.editWork(r.workId, { title: 'Pamiętnik Babci Zosi', authors: ['Zofia Nowak', 'Jan Nowak'] }, alice);
		await editor.editEdition(r.editionId, { pageCount: 212 }, alice);
		const edits = await db.query.metadataEdits.findMany();
		expect(edits.map((e) => Object.keys(e.diff as object).sort())).toEqual(expect.arrayContaining([['authors', 'title'], ['pageCount']]));
		expect((await catalog.search('jan nowak'))[0]?.title).toBe('Pamiętnik Babci Zosi');
		// A manual book with a catalogued ISBN returns the existing edition.
		await catalog.lookup('9780547928227');
		expect((await editor.createManual({ title: 'x', authors: [], isbn: '9780547928227' }, alice)).existed).toBe(true);
	});
});
