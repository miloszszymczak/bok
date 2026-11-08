/**
 * Integration tests against a real Postgres. Run with TEST_DATABASE_URL set, e.g.
 *   TEST_DATABASE_URL=postgres://bok:bok@localhost:5432/bok_test npm test
 * Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultLayout, setShelfCount, uuidv7 } from '@bok/core';
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

describe.skipIf(!url)('shelves (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 4 });
	const kv = memoryKv();
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue: noQueue });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const shelves = createShelves({ db, storage });
	const library = createLibrary({ db, catalog, accounts, storage, shelves });
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

	async function bookcase() {
		const room = await shelves.createLocation(alice, 'Salon');
		// 5 columns with 3, 5, 5, 4, 6 shelves.
		let layout = defaultLayout(5, 5, { width: 400, height: 200 });
		[3, 5, 5, 4, 6].forEach((n, i) => (layout = setShelfCount(layout, i, n)));
		const id = await shelves.createContainer(alice, room, 'Billy', layout);
		return { room, id };
	}

	it('creates a mixed bookcase with ordered, labelled sections', async () => {
		const { id } = await bookcase();
		const tree = await shelves.tree(alice);
		const c = tree.locations[0]!.containers[0]!;
		expect(c.id).toBe(id);
		expect(c.sections).toHaveLength(23);
		expect(c.sections.slice(0, 4).map((s) => s.label)).toEqual(['A1', 'A2', 'A3', 'B1']);
	});

	it('scans into shelves, moves, and refuses other households', async () => {
		await bookcase();
		const [a1, a2] = (await shelves.tree(alice)).locations[0]!.containers[0]!.sections;
		const hob = await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9780547928227', sectionId: a1!.id });
		expect(hob).toMatchObject({ status: 'added', copy: { sectionId: a1!.id } });
		expect(await library.scanMove({ userId: alice, code: '9780547928227', sectionId: a1!.id })).toMatchObject({ status: 'already_here' });
		expect(await library.scanMove({ userId: alice, code: '9780547928227', sectionId: a2!.id })).toMatchObject({ status: 'moved', fromSectionId: a1!.id });
		expect(await library.scanMove({ userId: alice, code: '9788375780635', sectionId: a2!.id })).toMatchObject({ status: 'not_owned' });
		expect((await shelves.section(alice, a2!.id)).books.map((b) => b.title)).toEqual(['The Hobbit']);
		await expect(library.scanAdd({ userId: bob, clientId: uuidv7(), code: '9780547928227', sectionId: a1!.id })).rejects.toThrow();
		await expect(shelves.moveCopies(bob, [hob.status === 'added' ? hob.copy.id : ''], null)).rejects.toThrow();
		await expect(shelves.tree(bob, (await shelves.tree(alice)).householdId)).rejects.toThrow();
	});

	it('asks where books go when a layout removes a non-empty shelf', async () => {
		const { id } = await bookcase();
		const secs = (await shelves.tree(alice)).locations[0]!.containers[0]!.sections;
		const lastOfE = secs.filter((s) => s.col === 4).at(-1)!; // E6
		const a1 = secs[0]!;
		await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9780547928227', sectionId: lastOfE.id });
		const c = await shelves.getContainer(alice, id);
		const fewer = setShelfCount(c.layout, 4, 5);
		const res = await shelves.setLayout(alice, id, fewer);
		expect(res).toMatchObject({ ok: false, orphans: [{ label: 'E6', count: 1 }] });
		expect(await shelves.setLayout(alice, id, fewer, a1.id)).toEqual({ ok: true });
		expect((await shelves.section(alice, a1.id)).books).toHaveLength(1);
		const after = (await shelves.tree(alice)).locations[0]!.containers[0]!;
		expect(after.sections).toHaveLength(22);
		expect(after.sections.find((s) => s.id === a1.id)).toBeTruthy(); // ids of kept shelves are stable
	});

	it('shares a household by invite', async () => {
		await bookcase();
		const token = await shelves.createInvite(alice);
		expect((await shelves.invite(token))?.inviter).toBe('Alice');
		await shelves.acceptInvite(bob, token);
		expect(await shelves.invite(token)).toBeNull(); // single use
		const tree = await shelves.tree(bob);
		expect(tree.locations[0]?.name).toBe('Salon');
		const a1 = tree.locations[0]!.containers[0]!.sections[0]!;
		const r = await library.scanAdd({ userId: bob, clientId: uuidv7(), code: '9788375780635', sectionId: a1.id });
		expect(r.status).toBe('added');
		expect((await shelves.section(alice, a1.id)).books.map((b) => b.title)).toEqual(['Ostatnie życzenie']);
		expect((await shelves.members(tree.householdId)).map((m) => m.displayName)).toEqual(['Alice', 'Bob']);
		await shelves.leave(bob, tree.householdId);
		await expect(shelves.tree(bob, tree.householdId)).rejects.toThrow();
		await expect(shelves.leave(bob, (await shelves.tree(bob)).householdId)).rejects.toThrow(); // last household
	});

	it('deleting a room leaves its books Unsorted', async () => {
		const { room } = await bookcase();
		const a1 = (await shelves.tree(alice)).locations[0]!.containers[0]!.sections[0]!;
		await library.scanAdd({ userId: alice, clientId: uuidv7(), code: '9780547928227', sectionId: a1.id });
		await shelves.deleteLocation(alice, room);
		const t = await shelves.tree(alice);
		expect(t.locations).toHaveLength(0);
		expect(t.unsorted).toBe(1);
		expect((await shelves.unsorted(alice)).map((b) => b.title)).toEqual(['The Hobbit']);
	});
});
