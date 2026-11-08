import { uuidv7 } from '@bok/core';
import type { BokDb } from './db.ts';
import { cacheAdd, cacheMoveCopy, cacheRemoveCopy, findLocal } from './library-cache.ts';
import type { MoveResult, ScanRecord, ScanResult } from './types.ts';

/**
 * Offline-first scan queue. Every scan is written to IndexedDB first, then sent in order.
 * Network failures leave records queued; they are retried on reconnect and on a timer.
 */
export class ScanQueue {
	private running = false;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private backoff = 2000;

	constructor(private readonly db: BokDb) {}

	async init() {
		// Crash/reload recovery: anything left "sending" was never confirmed.
		await this.db.scans.where('status').equals('sending').modify({ status: 'queued' });
		addEventListener('online', this.kick);
		this.kick();
	}

	destroy() {
		removeEventListener('online', this.kick);
		if (this.timer) clearTimeout(this.timer);
	}

	async enqueue(code: string, addon: string | null, opts: { kind?: 'add' | 'move'; sectionId?: string | null } = {}): Promise<ScanRecord> {
		const local = await findLocal(this.db, code);
		const rec: ScanRecord = {
			id: uuidv7(),
			code,
			addon,
			scannedAt: Date.now(),
			status: 'queued',
			kind: opts.kind ?? 'add',
			sectionId: opts.sectionId ?? null,
			attempts: 0,
			localHint: local && opts.kind !== 'move' ? 'owned' : undefined,
			book: local ? stripCopies(local) : undefined
		};
		await this.db.scans.add(rec);
		this.kick();
		return rec;
	}

	async addAnother(id: string) {
		await this.db.scans.update(id, { status: 'queued', force: true, duplicateOf: undefined });
		this.kick();
	}

	/** Duplicate scanned while aiming at a shelf: move my existing copy there instead. */
	async moveHere(id: string) {
		await this.db.scans.update(id, { status: 'queued', kind: 'move', duplicateOf: undefined });
		this.kick();
	}

	async skip(id: string) {
		await this.db.scans.update(id, { status: 'skipped' });
	}

	async retry(id: string) {
		await this.db.scans.update(id, { status: 'queued', error: undefined });
		this.kick();
	}

	async undo(id: string) {
		const rec = await this.db.scans.get(id);
		if (!rec) return;
		if (rec.status === 'queued' || rec.status === 'error') await this.db.scans.update(id, { status: 'undone' });
		else if (rec.status === 'moved') {
			// Undo a move = move it back where it was.
			await this.db.scans.update(id, { status: 'undo_queued' });
			this.kick();
		} else if (rec.kind === 'move') await this.db.scans.update(id, { status: 'skipped' });
		else if (rec.status === 'sending') await this.db.scans.update(id, { undoRequested: true });
		else if (rec.status === 'added') {
			await this.db.scans.update(id, { status: 'undo_queued' });
			this.kick();
		} else await this.db.scans.update(id, { status: 'skipped' });
	}

	kick = () => {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		void this.run();
	};

	private schedule(ms: number) {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(this.kick, ms);
	}

	private async run() {
		if (this.running) return;
		this.running = true;
		try {
			for (;;) {
				const next = (await this.db.scans.where('status').anyOf('queued', 'undo_queued').sortBy('scannedAt'))[0];
				if (!next) {
					this.backoff = 2000;
					return;
				}
				if (!navigator.onLine) return; // 'online' event resumes
				const ok = next.status === 'queued' ? await this.send(next) : await this.sendUndo(next);
				if (!ok) {
					this.schedule(this.backoff);
					this.backoff = Math.min(this.backoff * 2, 60_000);
					return;
				}
				this.backoff = 2000;
			}
		} finally {
			this.running = false;
		}
	}

	/** Returns false on a transient failure (retry later), true when the record was settled. */
	private async send(rec: ScanRecord): Promise<boolean> {
		await this.db.scans.update(rec.id, { status: 'sending', attempts: rec.attempts + 1 });
		const move = rec.kind === 'move' && !!rec.sectionId;
		let res: Response;
		try {
			res = await fetch(move ? '/api/v1/scans/move' : '/api/v1/scans', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(move ? { code: rec.code, sectionId: rec.sectionId } : { id: rec.id, code: rec.code, force: rec.force === true, sectionId: rec.sectionId ?? null })
			});
		} catch {
			await this.db.scans.update(rec.id, { status: 'queued' });
			return false;
		}
		if (res.status === 429 || res.status >= 500) {
			await this.db.scans.update(rec.id, { status: 'queued' });
			return false;
		}
		if (!res.ok) {
			await this.db.scans.update(rec.id, { status: 'error', error: res.status === 401 ? 'signed_out' : `http_${res.status}` });
			return true;
		}
		if (move) {
			const r = (await res.json()) as MoveResult;
			if (r.status === 'moved') await cacheMoveCopy(this.db, r.copy.id, r.copy.sectionId);
			await this.db.scans.update(rec.id, {
				status: r.status,
				book: 'book' in r ? r.book : undefined,
				fromSectionId: r.status === 'moved' ? r.fromSectionId : undefined,
				copyId: 'copy' in r ? r.copy.id : undefined,
				localHint: undefined
			});
			return true;
		}
		const r = (await res.json()) as ScanResult;
		const latest = await this.db.scans.get(rec.id);
		if (r.status === 'added') {
			await cacheAdd(this.db, r.book, r.copy);
			const undo = latest?.undoRequested;
			await this.db.scans.update(rec.id, {
				status: undo ? 'undo_queued' : 'added',
				book: r.book,
				otherCopies: r.otherCopies,
				sameWorkOtherEditions: r.sameWorkOtherEditions,
				localHint: undefined
			});
		} else if (r.status === 'duplicate') {
			await this.db.scans.update(rec.id, { status: latest?.undoRequested ? 'skipped' : 'duplicate', book: r.book, duplicateOf: r.copies });
		} else {
			await this.db.scans.update(rec.id, { status: r.status });
		}
		return true;
	}

	private async sendUndo(rec: ScanRecord): Promise<boolean> {
		if (rec.kind === 'move' && rec.copyId) {
			try {
				const res = await fetch('/api/v1/copies/move', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ copyIds: [rec.copyId], sectionId: rec.fromSectionId ?? null })
				});
				if (res.status === 429 || res.status >= 500) return false;
			} catch {
				return false;
			}
			await cacheMoveCopy(this.db, rec.copyId, rec.fromSectionId ?? null);
			await this.db.scans.update(rec.id, { status: 'undone' });
			return true;
		}
		try {
			const res = await fetch(`/api/v1/copies/${rec.id}`, { method: 'DELETE' });
			if (res.status === 429 || res.status >= 500) return false;
		} catch {
			return false;
		}
		await cacheRemoveCopy(this.db, rec.id);
		await this.db.scans.update(rec.id, { status: 'undone' });
		return true;
	}
}

function stripCopies<T extends { copies?: unknown }>(e: T): Omit<T, 'copies'> {
	const { copies: _copies, ...rest } = e;
	void _copies;
	return rest;
}
