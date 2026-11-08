import { estimateDays, median, normalizeFinish, suggestPace, type Pace, type Precision } from '@bok/core';
import { editions, readingEvents, readingGoals, readingStates, reads, works, type Db } from '@bok/db';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Storage } from './storage.ts';
import { Forbidden, NotFound } from './shelves.ts';

export type Status = 'want_to_read' | 'reading' | 'stuck' | 'read' | 'dnf';
export type Format = 'paper' | 'ebook' | 'audiobook';
export type Visibility = 'public' | 'followers' | 'friends' | 'private';
export const STATUSES: Status[] = ['want_to_read', 'reading', 'stuck', 'read', 'dnf'];
export const STUCK_AFTER_DAYS = 30;

export interface FinishInput {
	outcome?: 'finished' | 'dnf';
	date?: string | null;
	precision?: Precision | null;
	rating?: number | null;
	review?: string;
	reviewSpoiler?: boolean;
	durationDaysOverride?: number | null;
	pace?: Pace | null;
	visibility?: Visibility;
	editionId?: string | null;
	format?: Format;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
const today = (now: Date) => now.toISOString().slice(0, 10);

export function createReading(deps: { db: Db; storage: Storage }) {
	const { db, storage } = deps;
	const cover = (key: string | null, src: string | null) => (key ? storage.url(`${key}-s.webp`) : src);

	async function currentRead(tx: Tx | Db, userId: string, workId: string) {
		return tx.query.reads.findFirst({
			where: and(eq(reads.userId, userId), eq(reads.workId, workId), eq(reads.outcome, 'in_progress')),
			orderBy: [desc(reads.createdAt)]
		});
	}

	async function upsertState(tx: Tx | Db, userId: string, workId: string, status: Status, stuckSource: 'auto' | 'manual' | null = null) {
		await tx
			.insert(readingStates)
			.values({ userId, workId, status, stuckSource })
			.onConflictDoUpdate({ target: [readingStates.userId, readingStates.workId], set: { status, stuckSource, updatedAt: new Date() } });
	}

	async function event(tx: Tx | Db, readId: string, userId: string, type: typeof readingEvents.$inferInsert.type, at: Date, extra: { progress?: number | null; data?: unknown } = {}) {
		await tx.insert(readingEvents).values({ readId, userId, type, occurredAt: at, progress: extra.progress ?? null, data: extra.data ?? null });
	}

	async function ownRead(userId: string, readId: string) {
		const r = await db.query.reads.findFirst({ where: eq(reads.id, readId) });
		if (!r) throw new NotFound();
		if (r.userId !== userId) throw new Forbidden();
		return r;
	}

	async function startRead(tx: Tx, userId: string, workId: string, now: Date, opts: { editionId?: string | null; format?: Format } = {}) {
		const ed = opts.editionId
			? await tx.query.editions.findFirst({ where: eq(editions.id, opts.editionId), columns: { id: true, pageCount: true, format: true, workId: true } })
			: await tx.query.editions.findFirst({ where: eq(editions.workId, workId), orderBy: [desc(editions.metadataQuality)], columns: { id: true, pageCount: true, format: true, workId: true } });
		const format: Format = opts.format ?? (ed?.format === 'ebook' ? 'ebook' : ed?.format === 'audiobook' ? 'audiobook' : 'paper');
		const [r] = await tx
			.insert(reads)
			.values({
				userId,
				workId,
				editionId: ed && ed.workId === workId ? ed.id : null,
				format,
				startedOn: today(now),
				total: format === 'paper' ? (ed?.pageCount ?? null) : format === 'ebook' ? 100 : null,
				lastActivityAt: now
			})
			.returning();
		await event(tx, r!.id, userId, 'started', now);
		return r!;
	}

	/** Reader's median pages/day over finished reads with known pages and duration. */
	async function medianRate(userId: string) {
		const rows = await db
			.select({ total: reads.total, startedOn: reads.startedOn, finishedOn: reads.finishedOn, precision: reads.finishedPrecision, override: reads.durationDaysOverride, format: reads.format })
			.from(reads)
			.where(and(eq(reads.userId, userId), eq(reads.outcome, 'finished')))
			.orderBy(desc(reads.finishedOn))
			.limit(50);
		const rates = rows
			.filter((r) => r.format === 'paper' && r.total)
			.map((r) => {
				const d = r.override ?? (r.precision === 'day' ? estimateDays(r.startedOn, r.finishedOn) : null);
				return d ? r.total! / d : NaN;
			});
		return median(rates);
	}

	/** Days for a read: explicit override, else first "started" event → finish. */
	async function estimateFor(readId: string, finishedOn: string | null, precision: Precision | null) {
		const started = await db.query.readingEvents.findFirst({
			where: and(eq(readingEvents.readId, readId), eq(readingEvents.type, 'started')),
			orderBy: [asc(readingEvents.occurredAt)]
		});
		const finished = await db.query.readingEvents.findFirst({
			where: and(eq(readingEvents.readId, readId), eq(readingEvents.type, 'finished')),
			orderBy: [desc(readingEvents.occurredAt)]
		});
		const end = precision === 'day' && finishedOn ? finishedOn : (finished?.occurredAt ?? null);
		return estimateDays(started?.occurredAt ?? null, end);
	}

	const api = {
		STATUSES,

		/** Everything the book page needs about me and this work. */
		async forWork(userId: string, workId: string) {
			const [state, all] = await Promise.all([
				db.query.readingStates.findFirst({ where: and(eq(readingStates.userId, userId), eq(readingStates.workId, workId)) }),
				db.query.reads.findMany({ where: and(eq(reads.userId, userId), eq(reads.workId, workId)), orderBy: [desc(reads.createdAt)] })
			]);
			const current = all.find((r) => r.outcome === 'in_progress') ?? null;
			const events = current
				? await db.query.readingEvents.findMany({ where: eq(readingEvents.readId, current.id), orderBy: [asc(readingEvents.occurredAt)] })
				: [];
			const past = await Promise.all(
				all
					.filter((r) => r.outcome !== 'in_progress')
					.map(async (r) => ({ ...r, estimatedDays: await estimateFor(r.id, r.finishedOn, r.finishedPrecision) }))
			);
			return { status: (state?.status ?? null) as Status | null, stuckSource: state?.stuckSource ?? null, current, events, past };
		},

		async statuses(userId: string, workIds: string[]) {
			if (!workIds.length) return new Map<string, Status>();
			const rows = await db
				.select({ workId: readingStates.workId, status: readingStates.status })
				.from(readingStates)
				.where(and(eq(readingStates.userId, userId), inArray(readingStates.workId, workIds)));
			return new Map(rows.map((r) => [r.workId, r.status as Status]));
		},

		/**
		 * One-tap status change. "read"/"dnf" without details finish the current read today;
		 * use `finish` for the full sheet. `null` clears the status (history stays).
		 */
		async setStatus(userId: string, workId: string, status: Status | null, opts: { now?: Date; editionId?: string | null } = {}) {
			const now = opts.now ?? new Date();
			const w = await db.query.works.findFirst({ where: eq(works.id, workId), columns: { id: true } });
			if (!w) throw new NotFound();
			if (status === 'read' || status === 'dnf') return api.finish(userId, workId, { outcome: status === 'read' ? 'finished' : 'dnf', date: today(now), precision: 'day' }, now);
			await db.transaction(async (tx) => {
				const prev = await tx.query.readingStates.findFirst({ where: and(eq(readingStates.userId, userId), eq(readingStates.workId, workId)) });
				if (status === null) {
					await tx.delete(readingStates).where(and(eq(readingStates.userId, userId), eq(readingStates.workId, workId)));
					return;
				}
				if (status === 'want_to_read') {
					await upsertState(tx, userId, workId, 'want_to_read');
					return;
				}
				let cur = await currentRead(tx, userId, workId);
				if (status === 'reading') {
					if (!cur) cur = await startRead(tx, userId, workId, now, { editionId: opts.editionId });
					else if (prev?.status === 'stuck' || prev?.status === 'want_to_read') {
						await event(tx, cur.id, userId, 'resumed', now);
						await tx.update(reads).set({ lastActivityAt: now }).where(eq(reads.id, cur.id));
					}
					await upsertState(tx, userId, workId, 'reading');
					return;
				}
				// manual stuck
				if (!cur) cur = await startRead(tx, userId, workId, now, { editionId: opts.editionId });
				await event(tx, cur.id, userId, 'stuck', now, { data: { source: 'manual' } });
				await upsertState(tx, userId, workId, 'stuck', 'manual');
			});
			return null;
		},

		/** Progress on the current read. Clears an automatic "stuck"; a manual one stays until the status changes. */
		async progress(userId: string, readId: string, input: { progress: number; total?: number | null; format?: Format }, now = new Date()) {
			const r = await ownRead(userId, readId);
			if (r.outcome !== 'in_progress') throw new Error('read is finished');
			const total = input.total ?? r.total;
			const value = Math.max(0, Math.round(input.progress));
			await db.transaction(async (tx) => {
				await tx
					.update(reads)
					.set({ progress: total ? Math.min(value, total) : value, total: total ?? null, format: input.format ?? r.format, lastActivityAt: now })
					.where(eq(reads.id, readId));
				await event(tx, readId, userId, 'progress', now, { progress: value });
				const st = await tx.query.readingStates.findFirst({ where: and(eq(readingStates.userId, userId), eq(readingStates.workId, r.workId)) });
				if (!st || st.status === 'want_to_read' || (st.status === 'stuck' && st.stuckSource === 'auto')) {
					if (st?.status === 'stuck') await event(tx, readId, userId, 'resumed', now);
					await upsertState(tx, userId, r.workId, 'reading');
				}
			});
		},

		/** Finish (or abandon) the current read — or log a read without one (old books, "Past"). */
		async finish(userId: string, workId: string, input: FinishInput, now = new Date()) {
			const outcome = input.outcome ?? 'finished';
			const { date, precision } = normalizeFinish(input.date ?? null, input.precision ?? null);
			const rating = input.rating === null || input.rating === undefined ? null : Math.max(0, Math.min(10, Math.round(input.rating)));
			const readId = await db.transaction(async (tx) => {
				let cur = await currentRead(tx, userId, workId);
				if (!cur) {
					const [r] = await tx
						.insert(reads)
						.values({ userId, workId, editionId: input.editionId ?? null, format: input.format ?? 'paper', startedOn: null, lastActivityAt: now })
						.returning();
					cur = r!;
				}
				await tx
					.update(reads)
					.set({
						outcome,
						finishedOn: date,
						finishedPrecision: precision,
						rating,
						review: (input.review ?? '').slice(0, 20_000),
						reviewSpoiler: !!input.reviewSpoiler,
						durationDaysOverride: input.durationDaysOverride ?? null,
						pace: input.pace ?? null,
						visibility: input.visibility ?? 'public',
						...(outcome === 'finished' && cur.total ? { progress: cur.total } : {})
					})
					.where(eq(reads.id, cur.id));
				await event(tx, cur.id, userId, outcome === 'finished' ? 'finished' : 'dnf', now);
				await upsertState(tx, userId, workId, outcome === 'finished' ? 'read' : 'dnf');
				return cur.id;
			});
			return readId;
		},

		/** Edit a finished read (diary entry). */
		async updateRead(userId: string, readId: string, input: FinishInput) {
			const r = await ownRead(userId, readId);
			const { date, precision } = 'date' in input || 'precision' in input ? normalizeFinish(input.date ?? null, input.precision ?? null) : { date: r.finishedOn, precision: r.finishedPrecision };
			await db
				.update(reads)
				.set({
					finishedOn: date,
					finishedPrecision: precision,
					rating: input.rating === undefined ? r.rating : input.rating === null ? null : Math.max(0, Math.min(10, Math.round(input.rating))),
					review: input.review === undefined ? r.review : input.review.slice(0, 20_000),
					reviewSpoiler: input.reviewSpoiler ?? r.reviewSpoiler,
					durationDaysOverride: input.durationDaysOverride === undefined ? r.durationDaysOverride : input.durationDaysOverride,
					pace: input.pace === undefined ? r.pace : input.pace,
					visibility: input.visibility ?? r.visibility,
					format: input.format ?? r.format
				})
				.where(eq(reads.id, readId));
		},

		async deleteRead(userId: string, readId: string) {
			const r = await ownRead(userId, readId);
			await db.transaction(async (tx) => {
				await tx.delete(reads).where(eq(reads.id, readId));
				// Status follows what's left: an open read → reading, else the latest outcome, else nothing.
				const rest = await tx.query.reads.findMany({ where: and(eq(reads.userId, userId), eq(reads.workId, r.workId)), orderBy: [desc(reads.createdAt)] });
				const open = rest.find((x) => x.outcome === 'in_progress');
				if (open) await upsertState(tx, userId, r.workId, 'reading');
				else if (rest[0]) await upsertState(tx, userId, r.workId, rest[0].outcome === 'finished' ? 'read' : 'dnf');
				else await tx.delete(readingStates).where(and(eq(readingStates.userId, userId), eq(readingStates.workId, r.workId)));
			});
		},

		async read(userId: string, readId: string) {
			const r = await ownRead(userId, readId);
			const [events, estimatedDays, w] = await Promise.all([
				db.query.readingEvents.findMany({ where: eq(readingEvents.readId, readId), orderBy: [asc(readingEvents.occurredAt)] }),
				estimateFor(readId, r.finishedOn, r.finishedPrecision),
				db.query.works.findFirst({ where: eq(works.id, r.workId), columns: { id: true, title: true } })
			]);
			const rate = await medianRate(userId);
			const days = r.durationDaysOverride ?? estimatedDays;
			return { read: r, events, estimatedDays, suggestedPace: suggestPace(r.format === 'paper' ? r.total : null, days, rate), work: w! };
		},

		async suggestedPace(userId: string, readId: string, days: number | null) {
			const r = await ownRead(userId, readId);
			return suggestPace(r.format === 'paper' ? r.total : null, days, await medianRate(userId));
		},

		estimateFor,
		medianRate,

		/** Daily job: reading with no activity for 30 days → stuck (auto). */
		async markStuck(now = new Date()) {
			const cutoff = new Date(now.getTime() - STUCK_AFTER_DAYS * 86_400_000);
			const due = await db
				.select({ userId: readingStates.userId, workId: readingStates.workId, readId: reads.id })
				.from(readingStates)
				.innerJoin(reads, and(eq(reads.userId, readingStates.userId), eq(reads.workId, readingStates.workId), eq(reads.outcome, 'in_progress')))
				.where(and(eq(readingStates.status, 'reading'), lt(reads.lastActivityAt, cutoff)));
			for (const d of due) {
				await db.transaction(async (tx) => {
					await upsertState(tx, d.userId, d.workId, 'stuck', 'auto');
					await event(tx, d.readId, d.userId, 'stuck', now, { data: { source: 'auto' } });
				});
			}
			return due.length;
		},

		/** Diary entries (finished reads) with book info; filters are optional. */
		async log(userId: string, f: { year?: number; rating?: number; format?: Format; tagId?: string } = {}) {
			const conds = [eq(reads.userId, userId), eq(reads.outcome, 'finished')];
			if (f.year) conds.push(sql`extract(year from ${reads.finishedOn}) = ${f.year}`);
			if (f.rating !== undefined) conds.push(sql`${reads.rating} >= ${f.rating}`);
			if (f.format) conds.push(eq(reads.format, f.format));
			if (f.tagId) conds.push(sql`exists (select 1 from user_work_tags t where t.user_id = ${userId} and t.work_id = ${reads.workId} and t.tag_id = ${f.tagId})`);
			const rows = await db
				.select({
					id: reads.id,
					workId: reads.workId,
					editionId: reads.editionId,
					title: works.title,
					authors: sql<string[]>`coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = ${works.id}), '{}')`,
					coverKey: sql<string | null>`(select e.cover_key from editions e where e.id = coalesce(${reads.editionId}, (select id from editions where work_id = ${works.id} order by metadata_quality desc limit 1)))`,
					coverSourceUrl: sql<string | null>`(select e.cover_source_url from editions e where e.id = coalesce(${reads.editionId}, (select id from editions where work_id = ${works.id} order by metadata_quality desc limit 1)))`,
					finishedOn: reads.finishedOn,
					finishedPrecision: reads.finishedPrecision,
					rating: reads.rating,
					hasReview: sql<boolean>`length(${reads.review}) > 0`,
					format: reads.format,
					pace: reads.pace,
					createdAt: reads.createdAt,
					/** 1 = first read; >1 = reread number. */
					readNumber: sql<number>`(select count(*)::int from reads r2 where r2.user_id = "reads"."user_id" and r2.work_id = "reads"."work_id" and r2.outcome = 'finished' and r2.created_at <= "reads"."created_at")`
				})
				.from(reads)
				.innerJoin(works, eq(works.id, reads.workId))
				.where(and(...conds))
				.orderBy(desc(reads.finishedOn), desc(reads.createdAt));
			return rows.map(({ coverKey, coverSourceUrl, ...r }) => ({ ...r, cover: cover(coverKey, coverSourceUrl) }));
		},

		async years(userId: string) {
			const rows = await db
				.select({ y: sql<number>`extract(year from ${reads.finishedOn})::int` })
				.from(reads)
				.where(and(eq(reads.userId, userId), eq(reads.outcome, 'finished'), sql`${reads.finishedOn} is not null`))
				.groupBy(sql`1`)
				.orderBy(sql`1 desc`);
			return rows.map((r) => r.y);
		},

		async finishedInYear(userId: string, year: number) {
			const [r] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(reads)
				.where(and(eq(reads.userId, userId), eq(reads.outcome, 'finished'), sql`extract(year from ${reads.finishedOn}) = ${year}`));
			return r?.n ?? 0;
		},

		async goal(userId: string, year: number) {
			return (await db.query.readingGoals.findFirst({ where: and(eq(readingGoals.userId, userId), eq(readingGoals.year, year)) }))?.target ?? null;
		},

		async setGoal(userId: string, year: number, target: number | null) {
			if (!target) {
				await db.delete(readingGoals).where(and(eq(readingGoals.userId, userId), eq(readingGoals.year, year)));
				return;
			}
			const t = Math.max(1, Math.min(1000, Math.round(target)));
			await db
				.insert(readingGoals)
				.values({ userId, year, target: t })
				.onConflictDoUpdate({ target: [readingGoals.userId, readingGoals.year], set: { target: t, updatedAt: new Date() } });
		},

		/** Currently reading / stuck, newest activity first (home screen). */
		async inProgress(userId: string) {
			const rows = await db
				.select({
					readId: reads.id,
					workId: reads.workId,
					title: works.title,
					status: readingStates.status,
					stuckSource: readingStates.stuckSource,
					progress: reads.progress,
					total: reads.total,
					format: reads.format,
					lastActivityAt: reads.lastActivityAt,
					coverKey: sql<string | null>`(select e.cover_key from editions e where e.id = coalesce(${reads.editionId}, (select id from editions where work_id = ${works.id} order by metadata_quality desc limit 1)))`,
					coverSourceUrl: sql<string | null>`(select e.cover_source_url from editions e where e.id = coalesce(${reads.editionId}, (select id from editions where work_id = ${works.id} order by metadata_quality desc limit 1)))`
				})
				.from(reads)
				.innerJoin(works, eq(works.id, reads.workId))
				.innerJoin(readingStates, and(eq(readingStates.userId, reads.userId), eq(readingStates.workId, reads.workId)))
				.where(and(eq(reads.userId, userId), eq(reads.outcome, 'in_progress'), inArray(readingStates.status, ['reading', 'stuck'])))
				.orderBy(desc(reads.lastActivityAt));
			return rows.map(({ coverKey, coverSourceUrl, ...r }) => ({ ...r, cover: cover(coverKey, coverSourceUrl) }));
		},

		/** Offline cache for bookstore mode: statuses plus the ISBNs that map to each work. */
		async cache(userId: string) {
			const sums = await api.summaries(userId);
			if (!sums.length) return [];
			const isbns = await db
				.select({ workId: editions.workId, isbn13: editions.isbn13 })
				.from(editions)
				.where(and(inArray(editions.workId, sums.map((x) => x.workId)), sql`${editions.isbn13} is not null`));
			const by = new Map<string, string[]>();
			for (const r of isbns) by.set(r.workId, [...(by.get(r.workId) ?? []), r.isbn13!].slice(0, 50));
			return sums.map((x) => ({ ...x, isbns: by.get(x.workId) ?? [] }));
		},

		/** Bookstore mode / offline cache: my status and history per work. */
		async summaries(userId: string, workIds?: string[]) {
			const rows = await db
				.select({
					workId: readingStates.workId,
					status: readingStates.status,
					// Explicitly qualified: drizzle leaves columns unqualified in single-table queries,
					// which would bind them to the subquery's own table.
					timesRead: sql<number>`(select count(*)::int from reads r where r.user_id = ${userId} and r.work_id = "reading_states"."work_id" and r.outcome = 'finished')`,
					lastRating: sql<number | null>`(select r.rating from reads r where r.user_id = ${userId} and r.work_id = "reading_states"."work_id" and r.outcome = 'finished' order by r.finished_on desc nulls last, r.created_at desc limit 1)`
				})
				.from(readingStates)
				.where(and(eq(readingStates.userId, userId), workIds ? inArray(readingStates.workId, workIds.length ? workIds : ['00000000-0000-0000-0000-000000000000']) : undefined));
			return rows;
		}
	};
	return api;
}

export type Reading = ReturnType<typeof createReading>;
