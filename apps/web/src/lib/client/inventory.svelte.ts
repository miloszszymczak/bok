import { uuidv7 } from '@bok/core';
import type { BokDb } from './db.ts';
import { cacheAdd, cacheMoveCopy, findLocal, refreshLibrary } from './library-cache.ts';
import type { BookSummary, CheckResult, ScanResult } from './types.ts';

export interface InventoryItem {
	key: string;
	code: string;
	kind: 'confirmed' | 'misplaced' | 'unknown' | 'repeat';
	book?: BookSummary;
	copyId?: string;
	fromSectionId?: string | null;
	fixed?: 'moved' | 'added';
	busy?: boolean;
}

export interface ExpectedCopy {
	copyId: string;
	book: BookSummary;
	unsorted?: boolean;
}

/**
 * Shelf inventory. Scans are classified on the device against the cached library (works offline);
 * fixes (move here / add here / take off the shelf) call the API.
 */
export class Inventory {
	readonly startedAt = new Date();
	expected = $state<ExpectedCopy[]>([]);
	seen = $state<string[]>([]);
	items = $state<InventoryItem[]>([]);
	ready = $state(false);
	finished = $state(false);
	saving = $state(false);
	unsortedCount = $state(0);

	missing = $derived(this.expected.filter((e) => !this.seen.includes(e.copyId)));

	constructor(
		private readonly db: BokDb,
		readonly sectionId: string
	) {}

	async init() {
		await refreshLibrary(this.db, { force: true }).catch(() => false);
		const all = await this.db.editions.toArray();
		const expected: ExpectedCopy[] = [];
		for (const e of all) {
			const { copies, ...book } = e;
			for (const c of copies) if (c.sectionId === this.sectionId) expected.push({ copyId: c.id, book });
		}
		this.expected = expected.sort((a, b) => a.book.title.localeCompare(b.book.title));
		this.ready = true;
	}

	async scan(code: string) {
		const local = await findLocal(this.db, code);
		const key = uuidv7();
		if (local) {
			const { copies, ...book } = local;
			const here = copies.find((c) => c.sectionId === this.sectionId && !this.seen.includes(c.id));
			if (here) {
				this.seen = [...this.seen, here.id];
				this.items = [{ key, code, kind: 'confirmed', book, copyId: here.id }, ...this.items];
				return 'confirmed' as const;
			}
			if (copies.some((c) => c.sectionId === this.sectionId)) {
				this.items = [{ key, code, kind: 'repeat', book }, ...this.items];
				return 'repeat' as const;
			}
			const other = copies.find((c) => c.sectionId === null) ?? copies[0]!;
			this.items = [{ key, code, kind: 'misplaced', book, copyId: other.id, fromSectionId: other.sectionId }, ...this.items];
			return 'misplaced' as const;
		}
		this.items = [{ key, code, kind: 'unknown' }, ...this.items];
		if (navigator.onLine) {
			fetch(`/api/v1/check?code=${encodeURIComponent(code)}`)
				.then((r) => (r.ok ? (r.json() as Promise<CheckResult>) : null))
				.then((r) => r?.book && this.patch(key, { book: r.book }))
				.catch(() => {});
		}
		return 'unknown' as const;
	}

	private patch(key: string, p: Partial<InventoryItem>) {
		this.items = this.items.map((i) => (i.key === key ? { ...i, ...p } : i));
	}

	async moveHere(item: InventoryItem) {
		if (!item.copyId) return;
		this.patch(item.key, { busy: true });
		const res = await fetch('/api/v1/copies/move', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ copyIds: [item.copyId], sectionId: this.sectionId })
		}).catch(() => null);
		if (res?.ok) {
			await cacheMoveCopy(this.db, item.copyId, this.sectionId);
			this.patch(item.key, { fixed: 'moved', busy: false });
		} else this.patch(item.key, { busy: false });
	}

	async addHere(item: InventoryItem) {
		this.patch(item.key, { busy: true });
		const res = await fetch('/api/v1/scans', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id: uuidv7(), code: item.code, force: true, sectionId: this.sectionId })
		}).catch(() => null);
		if (res?.ok) {
			const r = (await res.json()) as ScanResult;
			if (r.status === 'added') {
				await cacheAdd(this.db, r.book, r.copy);
				this.patch(item.key, { fixed: 'added', busy: false, book: r.book, copyId: r.copy.id });
				return;
			}
		}
		this.patch(item.key, { busy: false });
	}

	/** A missing book: take it off this shelf (→ Unsorted) so the shelf list stays truthful. */
	async unsort(copyId: string) {
		const res = await fetch('/api/v1/copies/move', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ copyIds: [copyId], sectionId: null })
		}).catch(() => null);
		if (res?.ok) {
			await cacheMoveCopy(this.db, copyId, null);
			this.expected = this.expected.map((e) => (e.copyId === copyId ? { ...e, unsorted: true } : e));
			this.unsortedCount++;
		}
	}

	async finish() {
		this.saving = true;
		const result = {
			sectionId: this.sectionId,
			startedAt: this.startedAt.toISOString(),
			confirmed: this.seen,
			missing: this.missing.map((m) => m.copyId),
			misplaced: this.items.filter((i) => i.kind === 'misplaced').map((i) => ({ copyId: i.copyId!, fromSectionId: i.fromSectionId ?? null })),
			unknown: this.items.filter((i) => i.kind === 'unknown').map((i) => i.code),
			fixed: {
				moved: this.items.filter((i) => i.fixed === 'moved').length,
				added: this.items.filter((i) => i.fixed === 'added').length,
				unsorted: this.unsortedCount
			}
		};
		try {
			await fetch('/api/v1/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) });
		} catch {
			/* the report is still shown; saving the summary is best effort */
		}
		this.saving = false;
		this.finished = true;
	}
}
