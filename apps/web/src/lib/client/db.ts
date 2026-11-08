import Dexie, { type EntityTable } from 'dexie';
import type { CachedEdition, ScanRecord } from './types.ts';

export interface Meta {
	key: string;
	value: unknown;
}

export class BokDb extends Dexie {
	scans!: EntityTable<ScanRecord, 'id'>;
	editions!: EntityTable<CachedEdition, 'editionId'>;
	meta!: EntityTable<Meta, 'key'>;

	constructor(userId: string) {
		// One database per account, so a shared device never mixes libraries.
		super(`bok-${userId}`);
		this.version(1).stores({
			scans: 'id, status, scannedAt',
			editions: 'editionId, isbn13, issn, workId',
			meta: 'key'
		});
	}
}

let current: BokDb | null = null;

export function openDb(userId: string): BokDb {
	if (current?.name !== `bok-${userId}`) {
		current?.close();
		current = new BokDb(userId);
		try {
			localStorage.setItem('bok-has-local', '1');
		} catch {
			/* ignore */
		}
	}
	return current;
}

/** On sign-out: drop every local database and cached page of any account on this device. */
export async function wipeLocalData() {
	current?.close();
	current = null;
	try {
		const names = await Dexie.getDatabaseNames();
		await Promise.all(names.filter((n) => n.startsWith('bok-')).map((n) => Dexie.delete(n)));
	} catch {
		/* IndexedDB unavailable */
	}
	try {
		localStorage.removeItem('bok-has-local');
	} catch {
		/* ignore */
	}
	try {
		await caches.delete('pages-v1');
	} catch {
		/* no Cache API */
	}
}
