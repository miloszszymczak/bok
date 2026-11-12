import { foldText, parseImportFile, summarize, toRating, type ParsedRow } from '@bok/core';
import { copies, editions, householdMembers, importRows, imports, profiles, readingStates, readlists, reads, type Db, type ImportOptions, type ImportStats } from '@bok/db';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Catalog } from './catalog.ts';
import type { CatalogEditor } from './catalog-edit.ts';
import type { Library } from './library.ts';
import type { Notifications } from './notifications.ts';
import { QUEUES, type Queue } from './queue.ts';
import type { Reading } from './reading.ts';
import type { Readlists } from './readlists.ts';
import { Forbidden, NotFound } from './errors.ts';
import type { Tagging } from './tagging.ts';
import { log } from './log.ts';

export class ImportError extends Error {
	constructor(public code: 'empty' | 'no_title_column' | 'too_many_rows' | 'state' | 'too_large') {
		super(code);
	}
}

export const IMPORT_MAX_BYTES = 15 * 1024 * 1024;
/** Parallel lookups while matching (providers are the slow part); rows are applied one by one. */
const MATCH_CONCURRENCY = 12;
const CHUNK = 48;

export type Match =
	| { method: 'isbn' | 'title' | 'created' | 'chosen'; workId: string; editionId: string | null }
	| { method: 'review'; candidates: { workId: string; editionId: string | null; title: string; authors: string[]; score: number }[] };

const emptyStats = (total: number): ImportStats => ({ total, processed: 0, matched: 0, created: 0, review: 0, failed: 0, skipped: 0 });

/** Goodreads appends the series: "The Hobbit (Middle-earth, #1)" → "The Hobbit". */
export const bareTitle = (t: string) => t.replace(/\s*\([^()]*#\s*[\d.]+[^()]*\)\s*$/, '').trim();
/** For matching only: also without the subtitle ("Sapiens: A Brief History…" → "Sapiens"). */
const matchTitle = (t: string) => bareTitle(t).split(/\s*:\s/)[0]!;

const formatOf = (pages: number | null, binding?: string): 'paper' | 'ebook' | 'audiobook' => {
	const b = foldText(binding ?? '');
	return /kindle|ebook|e-book/.test(b) ? 'ebook' : /audio/.test(b) ? 'audiobook' : 'paper';
};

export function createImports(deps: { db: Db; catalog: Catalog; editor: CatalogEditor; reading: Reading; tagging: Tagging; readlists: Readlists; library: Library; queue: Queue; notifications: Notifications }) {
	const { db, catalog, editor, reading, tagging, library, queue, notifications } = deps;
	const lists_ = deps.readlists;

	async function own(userId: string, importId: string) {
		const imp = await db.query.imports.findFirst({ where: eq(imports.id, importId) });
		if (!imp) throw new NotFound();
		if (imp.userId !== userId) throw new Forbidden();
		return imp;
	}

	/** ISBN → our catalogue / providers; else exact title + author; else candidates for review; else a new record from the file. */
	async function match(userId: string, r: ParsedRow): Promise<Match> {
		if (r.isbn13) {
			const hit = await catalog.lookup(r.isbn13, { userId });
			if (hit.status === 'found') return { method: 'isbn', workId: hit.workId, editionId: hit.editionId };
			const made = await create(userId, r);
			return { method: 'created', ...made };
		}
		const title = foldText(matchTitle(r.title));
		const author = r.authors[0] ? foldText(r.authors[0]) : null;
		if (author) {
			const [exact] = await db.execute<{ work_id: string; edition_id: string | null }>(sql`
				select w.id as work_id, (select id from editions where work_id = w.id order by metadata_quality desc limit 1) as edition_id
				from works w join work_authors wa on wa.work_id = w.id join authors a on a.id = wa.author_id
				where (w.folded_title = ${title} or w.folded_original_title = ${title}) and a.folded = ${author}
				limit 1`);
			if (exact) return { method: 'title', workId: exact.work_id, editionId: exact.edition_id };
		}
		const found = (await catalog.search(`${matchTitle(r.title)} ${r.authors[0] ?? ''}`, 3)).filter((c) => c.score >= 0.45);
		if (found.length) return { method: 'review', candidates: found.map((c) => ({ workId: c.id, editionId: c.edition_id, title: c.title, authors: c.authors ?? [], score: Math.round(c.score * 100) / 100 })) };
		return { method: 'created', ...(await create(userId, r)) };
	}

	async function create(userId: string, r: ParsedRow) {
		const made = await editor.createManual(
			{ title: bareTitle(r.title) || r.title, authors: r.authors.length ? r.authors : [], publisher: r.publisher ?? undefined, year: r.year ?? undefined, pages: r.pages ?? undefined, isbn: r.isbn13 ?? undefined },
			userId
		);
		return { workId: made.workId, editionId: made.editionId };
	}

	/**
	 * Apply one matched row. Idempotent: re-importing the same file adds nothing — a finished read
	 * with the same date (or any, when the file has none) counts as already there; statuses never
	 * overwrite what you already have; tags/list items/copies are only added when missing.
	 */
	async function apply(userId: string, r: ParsedRow, m: { workId: string; editionId: string | null }, opts: ImportOptions, lists: Map<string, string>) {
		const { workId, editionId } = m;
		const result: Record<string, unknown> = {};
		const state = await db.query.readingStates.findFirst({ where: and(eq(readingStates.userId, userId), eq(readingStates.workId, workId)) });
		const rating = toRating(r.rating, opts.ratingScale);
		const ed = editionId ? await db.query.editions.findFirst({ where: eq(editions.id, editionId), columns: { pageCount: true, format: true } }) : undefined;
		const format = ed?.format === 'ebook' ? 'ebook' : ed?.format === 'audiobook' ? 'audiobook' : formatOf(r.pages);
		const pages = r.pages ?? ed?.pageCount ?? null;

		if (r.shelf === 'read' || r.shelf === 'dnf') {
			const outcome = r.shelf === 'read' ? 'finished' : 'dnf';
			const done = await db
				.select({ id: reads.id, finishedOn: reads.finishedOn })
				.from(reads)
				.where(and(eq(reads.userId, userId), eq(reads.workId, workId), eq(reads.outcome, outcome)));
			const base = { userId, workId, editionId, format, outcome, visibility: opts.visibility, total: format === 'paper' ? pages : null, progress: format === 'paper' && outcome === 'finished' ? pages : null } as const;
			const ids: string[] = [];
			const already = r.dateRead ? done.some((d) => d.finishedOn === r.dateRead) : done.length > 0;
			if (!already) {
				const [row] = await db
					.insert(reads)
					.values({ ...base, finishedOn: r.dateRead, finishedPrecision: r.dateRead ? 'day' : null, rating, review: r.review, reviewSpoiler: r.spoiler, finishedAt: null })
					.returning({ id: reads.id });
				ids.push(row!.id);
			}
			// Read Count > 1: earlier readings with unknown dates, so the "times read" is right.
			if (outcome === 'finished') {
				const missing = Math.max(r.readCount, 1) - (done.length + ids.length);
				for (let i = 0; i < missing; i++) {
					const [row] = await db.insert(reads).values({ ...base, finishedOn: null, finishedPrecision: null }).returning({ id: reads.id });
					ids.push(row!.id);
				}
			}
			if (!state || state.status === 'want_to_read' || (state.status === 'dnf' && outcome === 'finished')) {
				const status = outcome === 'finished' ? 'read' : 'dnf';
				await db.insert(readingStates).values({ userId, workId, status }).onConflictDoUpdate({ target: [readingStates.userId, readingStates.workId], set: { status, stuckSource: null, updatedAt: new Date() } });
			}
			result.reads = ids.length;
		} else if (r.shelf === 'reading' && !state) {
			await reading.setStatus(userId, workId, 'reading', { editionId });
			result.status = 'reading';
		} else if (r.shelf === 'want_to_read' && !state) {
			await reading.setStatus(userId, workId, 'want_to_read');
			result.status = 'want_to_read';
		}

		if (opts.shelvesAs === 'tags') for (const s of r.shelves) await tagging.add(userId, workId, s);
		else if (opts.shelvesAs === 'readlists') {
			for (const s of r.shelves) {
				const key = foldText(s);
				let listId = lists.get(key);
				if (!listId) {
					const existing = await db.query.readlists.findFirst({ where: and(eq(readlists.ownerId, userId), sql`lower(${readlists.title}) = lower(${s.slice(0, 120)})`) });
					listId = existing?.id ?? (await lists_.create(userId, { title: s, visibility: 'private' })).id;
					lists.set(key, listId);
				}
				await lists_.addItem(userId, listId, workId, editionId);
			}
		}

		if (opts.copies && r.owned > 0 && editionId) {
			const [has] = await db
				.select({ id: copies.id })
				.from(copies)
				.innerJoin(editions, eq(editions.id, copies.editionId))
				.innerJoin(householdMembers, and(eq(householdMembers.householdId, copies.householdId), eq(householdMembers.userId, userId)))
				.where(eq(editions.workId, workId))
				.limit(1);
			if (!has) result.copyId = await library.addCopy(userId, editionId);
		}
		return result;
	}

	async function bump(importId: string, delta: Partial<ImportStats>) {
		const parts = Object.entries(delta).map(([k, v]) => sql`${k}::text, coalesce((stats->>${k})::int, 0) + ${v}::int`);
		if (!parts.length) return;
		await db.execute(sql`update imports set stats = stats || jsonb_build_object(${sql.join(parts, sql`, `)}), updated_at = now() where id = ${importId}`);
	}

	const api = {
		/** Parse and store the file's rows; nothing is changed in the library until `confirm`. */
		async upload(userId: string, fileName: string, text: string) {
			if (text.length > IMPORT_MAX_BYTES) throw new ImportError('too_large');
			const f = parseImportFile(text);
			if (f.error) throw new ImportError(f.error);
			if (!f.rows.length) throw new ImportError('empty');
			const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId), columns: { logVisibility: true } });
			const [imp] = await db
				.insert(imports)
				.values({
					userId,
					source: f.source,
					fileName: fileName.slice(0, 200),
					options: { ratingScale: f.ratingScale, shelvesAs: 'tags', copies: true, visibility: p?.logVisibility ?? 'public' },
					stats: emptyStats(f.rows.length)
				})
				.returning({ id: imports.id });
			for (let i = 0; i < f.rows.length; i += 500) {
				await db.insert(importRows).values(f.rows.slice(i, i + 500).map((r) => ({ importId: imp!.id, line: r.line, raw: r })));
			}
			return imp!.id;
		},

		async get(userId: string, importId: string) {
			const imp = await own(userId, importId);
			return { id: imp.id, source: imp.source, fileName: imp.fileName, status: imp.status, options: imp.options, stats: imp.stats, error: imp.error, createdAt: imp.createdAt.toISOString(), finishedAt: imp.finishedAt?.toISOString() ?? null };
		},

		async preview(userId: string, importId: string) {
			await own(userId, importId);
			const rows = await db.select({ raw: importRows.raw }).from(importRows).where(eq(importRows.importId, importId)).orderBy(asc(importRows.line));
			const parsed = rows.map((r) => r.raw as ParsedRow);
			return { summary: summarize(parsed), sample: parsed.slice(0, 5), ratings: [...new Set(parsed.map((r) => r.rating).filter((x): x is number => x !== null))].sort((a, b) => a - b) };
		},

		async list(userId: string) {
			const rows = await db.query.imports.findMany({ where: eq(imports.userId, userId), orderBy: (t, { desc }) => [desc(t.createdAt)], limit: 20 });
			return rows.map((i) => ({ id: i.id, source: i.source, fileName: i.fileName, status: i.status, stats: i.stats, createdAt: i.createdAt.toISOString() }));
		},

		async confirm(userId: string, importId: string, options: Partial<ImportOptions>) {
			const imp = await own(userId, importId);
			if (imp.status !== 'preview') throw new ImportError('state');
			const o: ImportOptions = {
				ratingScale: options.ratingScale === 10 ? 10 : options.ratingScale === 5 ? 5 : imp.options.ratingScale,
				shelvesAs: options.shelvesAs && ['tags', 'readlists', 'none'].includes(options.shelvesAs) ? options.shelvesAs : imp.options.shelvesAs,
				copies: typeof options.copies === 'boolean' ? options.copies : imp.options.copies,
				visibility: options.visibility && ['public', 'followers', 'friends', 'private'].includes(options.visibility) ? options.visibility : imp.options.visibility
			};
			await db.update(imports).set({ status: 'queued', options: o, updatedAt: new Date() }).where(eq(imports.id, importId));
			await queue.send(QUEUES.importRun, { importId }, { singletonKey: importId });
		},

		async cancel(userId: string, importId: string) {
			const imp = await own(userId, importId);
			if (!['preview', 'queued', 'running'].includes(imp.status)) throw new ImportError('state');
			await db.update(imports).set({ status: 'cancelled', finishedAt: new Date(), updatedAt: new Date() }).where(eq(imports.id, importId));
		},

		/** Rows waiting for "which book is this?". */
		async reviewRows(userId: string, importId: string) {
			await own(userId, importId);
			const rows = await db.select().from(importRows).where(and(eq(importRows.importId, importId), eq(importRows.status, 'review'))).orderBy(asc(importRows.line)).limit(200);
			return rows.map((r) => ({ id: r.id, line: r.line, row: r.raw as ParsedRow, candidates: (r.match as Extract<Match, { method: 'review' }>).candidates }));
		},

		async failedRows(userId: string, importId: string) {
			await own(userId, importId);
			const rows = await db.select().from(importRows).where(and(eq(importRows.importId, importId), eq(importRows.status, 'failed'))).orderBy(asc(importRows.line)).limit(200);
			return rows.map((r) => ({ id: r.id, line: r.line, title: (r.raw as ParsedRow).title, error: r.error }));
		},

		/** Answer a review row: this book, a new record from the file, or skip it. */
		async resolve(userId: string, importId: string, rowId: string, choice: { workId: string } | 'create' | 'skip') {
			const imp = await own(userId, importId);
			const [row] = await db.select().from(importRows).where(and(eq(importRows.id, rowId), eq(importRows.importId, importId), eq(importRows.status, 'review')));
			if (!row) throw new NotFound();
			const r = row.raw as ParsedRow;
			if (choice === 'skip') {
				await db.update(importRows).set({ status: 'skipped', updatedAt: new Date() }).where(eq(importRows.id, rowId));
				await bump(importId, { review: -1, skipped: 1 });
				return;
			}
			let m: { workId: string; editionId: string | null };
			if (choice === 'create') m = await create(userId, r);
			else {
				const cand = (row.match as Extract<Match, { method: 'review' }>).candidates.find((c) => c.workId === choice.workId);
				if (!cand) throw new NotFound();
				m = { workId: cand.workId, editionId: cand.editionId };
			}
			const result = await apply(userId, r, m, imp.options, new Map());
			await db.update(importRows).set({ status: 'applied', match: { method: choice === 'create' ? 'created' : 'chosen', ...m }, result, updatedAt: new Date() }).where(eq(importRows.id, rowId));
			await bump(importId, choice === 'create' ? { review: -1, created: 1 } : { review: -1, matched: 1 });
		},

		/** Worker: match + apply all pending rows, with progress in `stats`. Safe to re-run after a crash. */
		async run(importId: string) {
			const imp = await db.query.imports.findFirst({ where: eq(imports.id, importId) });
			if (!imp || !['queued', 'running'].includes(imp.status)) return;
			await db.update(imports).set({ status: 'running', startedAt: imp.startedAt ?? new Date(), updatedAt: new Date() }).where(eq(imports.id, importId));
			const lists = new Map<string, string>();
			for (;;) {
				const cur = await db.query.imports.findFirst({ where: eq(imports.id, importId), columns: { status: true } });
				if (cur?.status !== 'running') return;
				const rows = await db.select().from(importRows).where(and(eq(importRows.importId, importId), eq(importRows.status, 'pending'))).orderBy(asc(importRows.line)).limit(CHUNK);
				if (!rows.length) break;
				// Match in parallel (network), apply in file order (same book twice must not race).
				const matches: (Match | Error)[] = new Array(rows.length);
				let next = 0;
				await Promise.all(
					Array.from({ length: Math.min(MATCH_CONCURRENCY, rows.length) }, async () => {
						while (next < rows.length) {
							const i = next++;
							matches[i] = await match(imp.userId, rows[i]!.raw as ParsedRow).catch((e: Error) => e);
						}
					})
				);
				const delta: Partial<ImportStats> = { processed: 0, matched: 0, created: 0, review: 0, failed: 0 };
				for (let i = 0; i < rows.length; i++) {
					const row = rows[i]!;
					const m = matches[i]!;
					delta.processed!++;
					try {
						if (m instanceof Error) throw m;
						if (m.method === 'review') {
							await db.update(importRows).set({ status: 'review', match: m, updatedAt: new Date() }).where(eq(importRows.id, row.id));
							delta.review!++;
							continue;
						}
						const result = await apply(imp.userId, row.raw as ParsedRow, m, imp.options, lists);
						await db.update(importRows).set({ status: 'applied', match: m, result, updatedAt: new Date() }).where(eq(importRows.id, row.id));
						if (m.method === 'created') delta.created!++;
						else delta.matched!++;
					} catch (e) {
						log.warn({ err: (e as Error).message, importId, line: row.line }, 'import row failed');
						await db.update(importRows).set({ status: 'failed', error: (e as Error).message.slice(0, 300), updatedAt: new Date() }).where(eq(importRows.id, row.id));
						delta.failed!++;
					}
				}
				await bump(importId, delta);
			}
			const [done] = await db.update(imports).set({ status: 'done', finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(imports.id, importId), eq(imports.status, 'running'))).returning();
			if (done) await notifications.notify(imp.userId, 'import_done', { data: { url: `/import/${importId}`, ...done.stats } });
		},

		/** Daily: drop the uploaded rows' raw data 30 days after an import (keeps the summary). */
		async purgeOld(now = new Date()) {
			const old = await db.select({ id: imports.id }).from(imports).where(sql`${imports.createdAt} < ${new Date(now.getTime() - 30 * 86_400_000)} and ${imports.status} in ('done', 'failed', 'cancelled', 'preview')`);
			if (!old.length) return 0;
			const res = await db.delete(importRows).where(inArray(importRows.importId, old.map((o) => o.id))).returning({ id: importRows.id });
			return res.length;
		}
	};
	return api;
}

export type Imports = ReturnType<typeof createImports>;
