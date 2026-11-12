import { parseIdentifier } from '@bok/core';
import { copies, editions, householdMembers, sections, works, type Db } from '@bok/db';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { Accounts } from './accounts.ts';
import type { Catalog } from './catalog.ts';
import type { Shelves } from './shelves.ts';
import type { Storage } from './storage.ts';
import { mediaUrls } from './media.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BookSummary {
	editionId: string;
	workId: string;
	title: string;
	authors: string[];
	year: number | null;
	publisher: string | null;
	isbn13: string | null;
	issn: string | null;
	cover: string | null;
}

export interface OwnedCopy {
	id: string;
	state: 'shelved' | 'lent' | 'lost';
	createdAt: string;
	sectionId: string | null;
	/** Active loan: who has it and until when. */
	lentTo?: string | null;
	dueOn?: string | null;
}

export interface BorrowedSummary {
	from: string;
	dueOn: string | null;
}

export type ScanResult =
	| { status: 'added'; copy: OwnedCopy; book: BookSummary; otherCopies: number; sameWorkOtherEditions: number }
	| { status: 'duplicate'; book: BookSummary; copies: OwnedCopy[] }
	| { status: 'not_found' }
	| { status: 'invalid' };

export type MoveResult =
	| { status: 'moved'; copy: OwnedCopy; book: BookSummary; fromSectionId: string | null }
	| { status: 'already_here'; copy: OwnedCopy; book: BookSummary }
	| { status: 'not_owned'; book: BookSummary }
	| { status: 'not_found' }
	| { status: 'invalid' };

export interface ReadingSummary {
	status: 'want_to_read' | 'reading' | 'stuck' | 'read' | 'dnf' | null;
	timesRead: number;
	lastRating: number | null;
}

export interface CheckResult {
	status: 'invalid' | 'not_found' | 'found';
	book?: BookSummary;
	copies: OwnedCopy[];
	sameWorkOtherEditions: number;
	reading?: ReadingSummary;
	borrowed?: BorrowedSummary[];
}

const lentToSql = sql<string | null>`(select coalesce(bp.display_name, l.borrower_name) from loans l left join profiles bp on bp.user_id = l.borrower_id where l.copy_id = "copies"."id" and l.status = 'active' limit 1)`;
const dueOnSql = sql<string | null>`(select l.due_on::text from loans l where l.copy_id = "copies"."id" and l.status = 'active' limit 1)`;
const authorsSql = sql<string[]>`coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = ${works.id}), '{}')`;

export function createLibrary(deps: { db: Db; catalog: Catalog; accounts: Accounts; storage: Storage; shelves: Shelves }) {
	const { db, catalog, accounts, storage, shelves } = deps;
	const copyOut = (c: { id: string; state: OwnedCopy['state']; createdAt: Date; sectionId: string | null; lentTo?: string | null; dueOn?: string | null }): OwnedCopy => ({
		id: c.id,
		state: c.state,
		createdAt: c.createdAt.toISOString(),
		sectionId: c.sectionId,
		...(c.lentTo ? { lentTo: c.lentTo, dueOn: c.dueOn ?? null } : {})
	});
	const { cover } = mediaUrls(storage);
	const myHouseholds = (userId: string) =>
		db.select({ id: householdMembers.householdId }).from(householdMembers).where(eq(householdMembers.userId, userId));

	async function summary(editionId: string): Promise<BookSummary | null> {
		const [r] = await db
			.select({
				editionId: editions.id,
				workId: works.id,
				title: editions.title,
				authors: authorsSql,
				year: editions.publishedYear,
				publisher: editions.publisher,
				isbn13: editions.isbn13,
				issn: editions.issn,
				coverKey: editions.coverKey,
				coverSourceUrl: editions.coverSourceUrl
			})
			.from(editions)
			.innerJoin(works, eq(works.id, editions.workId))
			.where(eq(editions.id, editionId));
		if (!r) return null;
		const { coverKey, coverSourceUrl, ...rest } = r;
		return { ...rest, cover: cover(coverKey, coverSourceUrl) };
	}

	async function ownedCopies(userId: string, editionId: string): Promise<OwnedCopy[]> {
		const rows = await db
			.select({ id: copies.id, state: copies.state, createdAt: copies.createdAt, sectionId: copies.sectionId, lentTo: lentToSql, dueOn: dueOnSql })
			.from(copies)
			.where(and(eq(copies.editionId, editionId), sql`${copies.householdId} in ${myHouseholds(userId)}`))
			.orderBy(copies.createdAt);
		return rows.map(copyOut);
	}

	async function sameWorkOtherEditions(userId: string, workId: string, editionId: string) {
		const [r] = await db
			.select({ n: sql<number>`count(*)::int` })
			.from(copies)
			.innerJoin(editions, eq(editions.id, copies.editionId))
			.where(and(eq(editions.workId, workId), ne(editions.id, editionId), sql`${copies.householdId} in ${myHouseholds(userId)}`));
		return r?.n ?? 0;
	}

	return {
		/**
		 * One scanned code → one copy. `clientId` becomes the copy id, so retries from the offline
		 * queue are idempotent. Without `force`, an edition already in the household is reported
		 * as a duplicate instead of being added.
		 */
		async scanAdd(input: { userId: string; clientId: string; code: string; force?: boolean; sectionId?: string | null }): Promise<ScanResult> {
			if (!UUID.test(input.clientId)) return { status: 'invalid' };
			if (input.sectionId && !UUID.test(input.sectionId)) return { status: 'invalid' };
			const already = await db.query.copies.findFirst({ where: eq(copies.id, input.clientId) });
			if (already) {
				// A retry of my own scan — never report someone else's copy that happens to have this id.
				const mine = await db.select({ id: householdMembers.householdId }).from(householdMembers).where(and(eq(householdMembers.userId, input.userId), eq(householdMembers.householdId, already.householdId)));
				if (!mine.length) return { status: 'invalid' };
				const book = (await summary(already.editionId))!;
				return { status: 'added', copy: copyOut(already), book, otherCopies: 0, sameWorkOtherEditions: 0 };
			}
			const r = await catalog.lookup(input.code, { userId: input.userId });
			if (r.status === 'invalid') return { status: 'invalid' };
			if (r.status === 'not_found') return { status: 'not_found' };
			const book = (await summary(r.editionId))!;
			const existing = await ownedCopies(input.userId, r.editionId);
			if (existing.length && !input.force) return { status: 'duplicate', book, copies: existing };

			// Scanning into a shelf puts the copy in that shelf's household (shared households).
			let householdId: string | null;
			if (input.sectionId) {
				const s = await db.query.sections.findFirst({ where: eq(sections.id, input.sectionId), columns: { householdId: true } });
				if (!s) return { status: 'invalid' };
				await shelves.assertMember(input.userId, s.householdId);
				householdId = s.householdId;
			} else householdId = await accounts.defaultHouseholdId(input.userId);
			if (!householdId) throw new Error('user has no household');
			const [row] = await db
				.insert(copies)
				.values({ id: input.clientId, householdId, editionId: r.editionId, ownerUserId: input.userId, sectionId: input.sectionId ?? null })
				.onConflictDoNothing()
				.returning();
			const copy = row ?? (await db.query.copies.findFirst({ where: eq(copies.id, input.clientId) }))!;
			return {
				status: 'added',
				copy: copyOut(copy),
				book,
				otherCopies: existing.length,
				sameWorkOtherEditions: await sameWorkOtherEditions(input.userId, r.workId, r.editionId)
			};
		},

		/**
		 * "Move" scan: put my copy of this book on `sectionId`. Prefers an Unsorted copy, then any copy
		 * elsewhere; idempotent (a copy already there reports `already_here`).
		 */
		async scanMove(input: { userId: string; code: string; sectionId: string }): Promise<MoveResult> {
			if (!UUID.test(input.sectionId)) return { status: 'invalid' };
			const r = await catalog.lookup(input.code, { userId: input.userId });
			if (r.status === 'invalid') return { status: 'invalid' };
			if (r.status === 'not_found') return { status: 'not_found' };
			const book = (await summary(r.editionId))!;
			const mine = await ownedCopies(input.userId, r.editionId);
			const here = mine.find((c) => c.sectionId === input.sectionId);
			if (here) return { status: 'already_here', copy: here, book };
			const pick = mine.find((c) => c.sectionId === null) ?? mine[0];
			if (!pick) return { status: 'not_owned', book };
			await shelves.moveCopies(input.userId, [pick.id], input.sectionId);
			return { status: 'moved', copy: { ...pick, sectionId: input.sectionId }, book, fromSectionId: pick.sectionId };
		},

		/** Idempotent: removing an already removed copy is fine. Only copies in the user's households. */
		async removeCopy(userId: string, copyId: string) {
			if (!UUID.test(copyId)) return false;
			const res = await db
				.delete(copies)
				.where(and(eq(copies.id, copyId), sql`${copies.householdId} in ${myHouseholds(userId)}`))
				.returning({ id: copies.id });
			return res.length > 0;
		},

		async addCopy(userId: string, editionId: string, sectionId: string | null = null) {
			let householdId = await accounts.defaultHouseholdId(userId);
			if (sectionId) {
				const s = await db.query.sections.findFirst({ where: eq(sections.id, sectionId), columns: { householdId: true } });
				if (!s) throw new Error('unknown shelf');
				await shelves.assertMember(userId, s.householdId);
				householdId = s.householdId;
			}
			if (!householdId) throw new Error('user has no household');
			const [row] = await db.insert(copies).values({ householdId, editionId, ownerUserId: userId, sectionId }).returning({ id: copies.id });
			return row!.id;
		},

		/** Bookstore mode: what do I have for this code? Looks the book up (and catalogues it) if needed. */
		async check(userId: string, code: string): Promise<CheckResult> {
			if (!parseIdentifier(code)) return { status: 'invalid', copies: [], sameWorkOtherEditions: 0 };
			const r = await catalog.lookup(code, { userId });
			if (r.status !== 'found') return { status: r.status === 'invalid' ? 'invalid' : 'not_found', copies: [], sameWorkOtherEditions: 0 };
			const [rs] = await db.execute<{ status: ReadingSummary['status']; times_read: number; last_rating: number | null }>(sql`
				select (select status from reading_states where user_id = ${userId} and work_id = ${r.workId}) as status,
					(select count(*)::int from reads where user_id = ${userId} and work_id = ${r.workId} and outcome = 'finished') as times_read,
					(select rating from reads where user_id = ${userId} and work_id = ${r.workId} and outcome = 'finished' order by finished_on desc nulls last, created_at desc limit 1) as last_rating`);
			return {
				status: 'found',
				book: (await summary(r.editionId)) ?? undefined,
				copies: await ownedCopies(userId, r.editionId),
				sameWorkOtherEditions: await sameWorkOtherEditions(userId, r.workId, r.editionId),
				reading: { status: rs?.status ?? null, timesRead: rs?.times_read ?? 0, lastRating: rs?.last_rating ?? null },
				borrowed: (
					await db.execute<{ from: string; due_on: string | null }>(sql`
						select coalesce(lp.display_name, l.lender_name, '—') as from, l.due_on::text
						from loans l left join profiles lp on lp.user_id = l.lender_id
						where l.borrower_id = ${userId} and l.status = 'active' and l.work_id = ${r.workId}`)
				).map((b) => ({ from: b.from, dueOn: b.due_on }))
			};
		},

		/** Everything the device caches for offline duplicate hints and bookstore mode. */
		/** Newest copies in my households (home screen), plus how many there are in all. */
		async recent(userId: string, limit = 12) {
			const mine = db.select({ id: householdMembers.householdId }).from(householdMembers).where(eq(householdMembers.userId, userId));
			const [rows, [count]] = await Promise.all([
				db
					.select({
						workId: works.id,
						title: editions.title,
						coverKey: editions.coverKey,
						coverSourceUrl: editions.coverSourceUrl,
						authors: sql<string[]>`coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = ${works.id}), '{}')`
					})
					.from(copies)
					.innerJoin(editions, eq(editions.id, copies.editionId))
					.innerJoin(works, eq(works.id, editions.workId))
					.where(sql`${copies.householdId} in ${mine}`)
					.orderBy(desc(copies.createdAt))
					.limit(limit),
				db.select({ n: sql<number>`count(*)::int` }).from(copies).where(sql`${copies.householdId} in ${mine}`)
			]);
			return { books: rows, total: count?.n ?? 0 };
		},

		async snapshot(userId: string) {
			const rows = await db
				.select({
					copyId: copies.id,
					state: copies.state,
					createdAt: copies.createdAt,
					sectionId: copies.sectionId,
					lentTo: lentToSql,
					dueOn: dueOnSql,
					editionId: editions.id,
					workId: works.id,
					title: editions.title,
					authors: authorsSql,
					year: editions.publishedYear,
					publisher: editions.publisher,
					isbn13: editions.isbn13,
					issn: editions.issn,
					coverKey: editions.coverKey,
					coverSourceUrl: editions.coverSourceUrl
				})
				.from(copies)
				.innerJoin(editions, eq(editions.id, copies.editionId))
				.innerJoin(works, eq(works.id, editions.workId))
				.where(sql`${copies.householdId} in ${myHouseholds(userId)}`)
				.orderBy(desc(copies.createdAt));
			const byEdition = new Map<string, BookSummary & { copies: OwnedCopy[] }>();
			for (const r of rows) {
				let e = byEdition.get(r.editionId);
				if (!e) {
					e = {
						editionId: r.editionId,
						workId: r.workId,
						title: r.title,
						authors: r.authors,
						year: r.year,
						publisher: r.publisher,
						isbn13: r.isbn13,
						issn: r.issn,
						cover: cover(r.coverKey, r.coverSourceUrl),
						copies: []
					};
					byEdition.set(r.editionId, e);
				}
				e.copies.push(copyOut({ id: r.copyId, state: r.state, createdAt: r.createdAt, sectionId: r.sectionId, lentTo: r.lentTo, dueOn: r.dueOn }));
			}
			return [...byEdition.values()];
		},

		summary
	};
}

export type Library = ReturnType<typeof createLibrary>;
