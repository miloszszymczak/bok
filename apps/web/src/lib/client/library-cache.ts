import { parseIdentifier } from '@bok/core';
import type { BokDb } from './db.ts';
import type { BookSummary, CachedEdition, CachedReading, OwnedCopy, StorageTree } from './types.ts';

const STALE_MS = 5 * 60_000;

/** Pull the owned-books snapshot (for offline duplicate hints and bookstore mode). */
export async function refreshLibrary(db: BokDb, opts: { force?: boolean } = {}) {
	if (!navigator.onLine) return false;
	const last = (await db.meta.get('librarySyncedAt'))?.value as number | undefined;
	if (!opts.force && last && Date.now() - last < STALE_MS) return false;
	const res = await fetch('/api/v1/library/snapshot', { credentials: 'same-origin' });
	if (!res.ok) return false;
	const { editions, reading } = (await res.json()) as { editions: CachedEdition[]; reading?: CachedReading[] };
	await db.transaction('rw', db.editions, db.meta, async () => {
		await db.editions.clear();
		await db.editions.bulkPut(editions);
		await db.meta.put({ key: 'reading', value: reading ?? [] });
		await db.meta.put({ key: 'librarySyncedAt', value: Date.now() });
	});
	return true;
}

export async function findLocal(db: BokDb, code: string): Promise<CachedEdition | undefined> {
	const id = parseIdentifier(code);
	if (!id) return undefined;
	if (id.kind === 'isbn') return db.editions.where('isbn13').equals(id.isbn13).first();
	if (id.kind === 'issn') return db.editions.where('issn').equals(id.issn).first();
	return undefined;
}

export async function cacheAdd(db: BokDb, book: BookSummary, copy: OwnedCopy) {
	await db.transaction('rw', db.editions, async () => {
		const e = await db.editions.get(book.editionId);
		const copies = (e?.copies ?? []).filter((c) => c.id !== copy.id);
		await db.editions.put({ ...book, copies: [...copies, copy] });
	});
}

export async function cacheRemoveCopy(db: BokDb, copyId: string) {
	await db.transaction('rw', db.editions, async () => {
		const all = await db.editions.toArray();
		for (const e of all) {
			if (!e.copies.some((c) => c.id === copyId)) continue;
			const copies = e.copies.filter((c) => c.id !== copyId);
			if (copies.length) await db.editions.put({ ...e, copies });
			else await db.editions.delete(e.editionId);
		}
	});
}

export async function cacheMoveCopy(db: BokDb, copyId: string, sectionId: string | null) {
	await db.transaction('rw', db.editions, async () => {
		const all = await db.editions.toArray();
		for (const e of all) {
			if (!e.copies.some((c) => c.id === copyId)) continue;
			await db.editions.put({ ...e, copies: e.copies.map((c) => (c.id === copyId ? { ...c, sectionId } : c)) });
		}
	});
}

/** Storage tree for the scan target picker — cached so it works offline. */
export async function loadTree(db: BokDb, opts: { refresh?: boolean } = {}): Promise<StorageTree | null> {
	if (opts.refresh !== false && navigator.onLine) {
		try {
			const res = await fetch('/api/v1/storage');
			if (res.ok) {
				const tree = (await res.json()) as StorageTree;
				await db.meta.put({ key: 'storage', value: tree });
				return tree;
			}
		} catch {
			/* offline — fall through to the cache */
		}
	}
	return ((await db.meta.get('storage'))?.value as StorageTree | undefined) ?? null;
}

export interface Place {
	sectionId: string;
	label: string;
	containerId: string;
	containerName: string;
	locationName: string;
}

/** Shelves in "Next shelf" order: rooms → bookcases → down each column. */
export function orderedPlaces(tree: StorageTree | null): Place[] {
	const out: Place[] = [];
	for (const l of tree?.locations ?? [])
		for (const c of l.containers)
			for (const s of c.sections) out.push({ sectionId: s.id, label: s.label, containerId: c.id, containerName: c.name, locationName: l.name });
	return out;
}

/** My reading status for a scanned code, from the device cache (works for books I don't own). */
export async function findReading(db: BokDb, code: string, workId?: string): Promise<CachedReading | undefined> {
	const list = ((await db.meta.get('reading'))?.value as CachedReading[] | undefined) ?? [];
	const id = parseIdentifier(code);
	const isbn = id?.kind === 'isbn' ? id.isbn13 : null;
	return list.find((r) => (workId && r.workId === workId) || (isbn && r.isbns.includes(isbn)));
}
