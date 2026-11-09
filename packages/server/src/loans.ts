import { isIsoDate, LOAN_NAME_MAX, localDate, localHour, reminderFor, REMINDER_HOUR } from '@bok/core';
import { copies, householdMembers, loans, profiles, type Db } from '@bok/db';
import { and, eq, sql } from 'drizzle-orm';
import type { Notifications, NotificationType } from './notifications.ts';
import { Forbidden, NotFound } from './shelves.ts';
import type { Storage } from './storage.ts';

/** Expected refusals (bad input, wrong state) — the web layer turns these into 400/409. */
export class LoanError extends Error {
	constructor(public code: 'invalid' | 'taken' | 'state' | 'blocked' | 'not_lendable' | 'duplicate') {
		super(code);
	}
}

export type LoanStatus = 'requested' | 'active' | 'returned' | 'declined' | 'cancelled';

export interface Party {
	userId: string | null;
	handle: string | null;
	name: string;
	avatar: string | null;
}

export interface LoanView {
	id: string;
	status: LoanStatus;
	/** My side of it. */
	role: 'lender' | 'borrower';
	other: Party;
	work: { id: string; title: string; authors: string[]; cover: string | null };
	editionId: string | null;
	copyId: string | null;
	requestedAt: string | null;
	lentOn: string | null;
	dueOn: string | null;
	returnedOn: string | null;
	returnMarked: boolean;
	extensionTo: string | null;
	note: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanName = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, LOAN_NAME_MAX) : '');
const cleanNote = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 500) : '');

type Row = {
	id: string;
	status: LoanStatus;
	copy_id: string | null;
	work_id: string;
	edition_id: string | null;
	lender_id: string | null;
	lender_name: string | null;
	borrower_id: string | null;
	borrower_name: string | null;
	requested_at: string | Date | null;
	lent_on: string | null;
	due_on: string | null;
	returned_on: string | null;
	return_marked_at: string | Date | null;
	extension_to: string | null;
	note: string;
	title: string;
	authors: string[];
	cover_key: string | null;
	cover_source_url: string | null;
	lender_handle: string | null;
	lender_display: string | null;
	lender_avatar: string | null;
	borrower_handle: string | null;
	borrower_display: string | null;
	borrower_avatar: string | null;
};

export function createLoans(deps: { db: Db; storage: Storage; notifications: Notifications }) {
	const { db, storage, notifications } = deps;
	const avatar = (k: string | null) => (k ? storage.url(k) : null);
	const cover = (key: string | null, src: string | null) => (key ? storage.url(`${key}-s.webp`) : src);

	const select = (where: ReturnType<typeof sql>, order = sql`l.updated_at desc`, limit = 200) => sql`
		select l.id, l.status, l.copy_id, l.work_id, l.edition_id, l.lender_id, l.lender_name, l.borrower_id, l.borrower_name,
			l.requested_at, l.lent_on::text, l.due_on::text, l.returned_on::text, l.return_marked_at, l.extension_to::text, l.note,
			w.title,
			coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = w.id), '{}') as authors,
			e.cover_key, e.cover_source_url,
			lp.handle as lender_handle, lp.display_name as lender_display, lp.avatar_key as lender_avatar,
			bp.handle as borrower_handle, bp.display_name as borrower_display, bp.avatar_key as borrower_avatar
		from loans l
		join works w on w.id = l.work_id
		left join lateral (
			select cover_key, cover_source_url from editions
			where id = l.edition_id or (l.edition_id is null and work_id = l.work_id)
			order by (cover_status = 'ready') desc, metadata_quality desc limit 1
		) e on true
		left join profiles lp on lp.user_id = l.lender_id
		left join profiles bp on bp.user_id = l.borrower_id
		where ${where}
		order by ${order}
		limit ${limit}`;

	function view(r: Row, me: string): LoanView {
		const role = r.lender_id === me ? 'lender' : 'borrower';
		const other: Party =
			role === 'lender'
				? { userId: r.borrower_id, handle: r.borrower_handle, name: r.borrower_display ?? r.borrower_name ?? '—', avatar: avatar(r.borrower_avatar) }
				: { userId: r.lender_id, handle: r.lender_handle, name: r.lender_display ?? r.lender_name ?? '—', avatar: avatar(r.lender_avatar) };
		return {
			id: r.id,
			status: r.status,
			role,
			other,
			work: { id: r.work_id, title: r.title, authors: r.authors, cover: cover(r.cover_key, r.cover_source_url) },
			editionId: r.edition_id,
			copyId: r.copy_id,
			requestedAt: r.requested_at ? new Date(r.requested_at).toISOString() : null,
			lentOn: r.lent_on,
			dueOn: r.due_on,
			returnedOn: r.returned_on,
			returnMarked: !!r.return_marked_at,
			extensionTo: r.extension_to,
			note: r.note
		};
	}

	async function load(loanId: string) {
		if (!UUID.test(loanId)) throw new NotFound();
		const l = await db.query.loans.findFirst({ where: eq(loans.id, loanId) });
		if (!l) throw new NotFound();
		return l;
	}

	async function blockedBetween(a: string | null, b: string | null) {
		if (!a || !b) return false;
		const r = await db.execute(sql`select 1 from blocks where (blocker_id = ${a} and blocked_id = ${b}) or (blocker_id = ${b} and blocked_id = ${a}) limit 1`);
		return r.length > 0;
	}

	async function titleOf(workId: string) {
		const [w] = await db.execute<{ title: string }>(sql`select title from works where id = ${workId}`);
		return w?.title ?? '';
	}

	async function today(userId: string, now = new Date()) {
		const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId), columns: { timezone: true } });
		return localDate(now, p?.timezone ?? 'Europe/Warsaw');
	}

	async function tell(userId: string | null, type: NotificationType, actorId: string | null, loan: { id: string; workId: string }, extra: Record<string, unknown> = {}, dedupeKey?: string) {
		if (!userId) return;
		await notifications.notify(userId, type, { actorId, data: { url: `/loans#loan-${loan.id}`, loanId: loan.id, title: await titleOf(loan.workId), ...extra }, dedupeKey });
	}

	/** The copy, if it's in one of my households. */
	async function myCopy(userId: string, copyId: string) {
		if (!UUID.test(copyId)) throw new NotFound();
		const [c] = await db
			.select({ id: copies.id, editionId: copies.editionId, state: copies.state, workId: sql<string>`(select work_id from editions where id = ${copies.editionId})` })
			.from(copies)
			.innerJoin(householdMembers, and(eq(householdMembers.householdId, copies.householdId), eq(householdMembers.userId, userId)))
			.where(eq(copies.id, copyId));
		if (!c) throw new NotFound();
		return c;
	}

	async function setCopyState(copyId: string | null, state: 'shelved' | 'lent') {
		if (copyId) await db.update(copies).set({ state, updatedAt: new Date() }).where(and(eq(copies.id, copyId), sql`${copies.state} <> 'lost'`));
	}

	const api = {
		/** Lend my copy to a user or to someone outside the app (a name). */
		async lend(userId: string, input: { copyId: string; borrowerId?: string | null; borrowerName?: string | null; dueOn?: string | null; note?: string }, now = new Date()) {
			const c = await myCopy(userId, input.copyId);
			const borrowerName = input.borrowerId ? null : cleanName(input.borrowerName);
			if (!input.borrowerId && !borrowerName) throw new LoanError('invalid');
			if (input.borrowerId === userId) throw new LoanError('invalid');
			if (input.dueOn != null && !isIsoDate(input.dueOn)) throw new LoanError('invalid');
			if (input.borrowerId) {
				if (!UUID.test(input.borrowerId)) throw new LoanError('invalid');
				const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, input.borrowerId), columns: { suspendedAt: true } });
				if (!p || p.suspendedAt) throw new LoanError('invalid');
				if (await blockedBetween(userId, input.borrowerId)) throw new LoanError('blocked');
			}
			if (c.state === 'lost') throw new LoanError('state');
			const lentOn = await today(userId, now);
			const id = await db.transaction(async (tx) => {
				const [row] = await tx
					.insert(loans)
					.values({ copyId: c.id, workId: c.workId, editionId: c.editionId, lenderId: userId, borrowerId: input.borrowerId ?? null, borrowerName, status: 'active', lentOn, dueOn: input.dueOn ?? null, note: cleanNote(input.note) })
					.onConflictDoNothing()
					.returning({ id: loans.id });
				if (!row) throw new LoanError('taken');
				await tx.update(copies).set({ state: 'lent', updatedAt: now }).where(eq(copies.id, c.id));
				return row.id;
			});
			await tell(input.borrowerId ?? null, 'loan_lent', userId, { id, workId: c.workId }, { dueOn: input.dueOn ?? null });
			return id;
		},

		/** I borrowed a book from someone outside the app (a sibling, a library). */
		async recordBorrow(userId: string, input: { workId: string; editionId?: string | null; lenderName: string; dueOn?: string | null; note?: string }, now = new Date()) {
			const lenderName = cleanName(input.lenderName);
			if (!lenderName || !UUID.test(input.workId) || (input.editionId && !UUID.test(input.editionId))) throw new LoanError('invalid');
			if (input.dueOn != null && !isIsoDate(input.dueOn)) throw new LoanError('invalid');
			const [w] = await db.execute(sql`select 1 from works where id = ${input.workId}`);
			if (!w) throw new NotFound();
			const [row] = await db
				.insert(loans)
				.values({ workId: input.workId, editionId: input.editionId ?? null, lenderName, borrowerId: userId, status: 'active', lentOn: await today(userId, now), dueOn: input.dueOn ?? null, note: cleanNote(input.note) })
				.returning({ id: loans.id });
			return row!.id;
		},

		/** Ask to borrow someone's lendable copy (needs their lending visibility to include me). */
		async request(userId: string, copyId: string, note = '') {
			if (!UUID.test(copyId)) throw new NotFound();
			const [c] = await db.execute<{ id: string; edition_id: string; work_id: string; owner: string | null; lendable: boolean; state: string; ok: boolean }>(sql`
				select c.id, c.edition_id, e.work_id, c.owner_user_id as owner, c.lendable, c.state,
					coalesce(can_view(${userId}, c.owner_user_id, p.lending_visibility) and p.hidden_at is null, false) as ok
				from copies c join editions e on e.id = c.edition_id left join profiles p on p.user_id = c.owner_user_id
				where c.id = ${copyId}`);
			if (!c || !c.owner || !c.ok) throw new NotFound();
			if (c.owner === userId) throw new LoanError('invalid');
			if (!c.lendable || c.state === 'lost') throw new LoanError('not_lendable');
			const open = await db.execute(sql`select 1 from loans where copy_id = ${copyId} and borrower_id = ${userId} and status in ('requested', 'active') limit 1`);
			if (open.length) throw new LoanError('duplicate');
			const [row] = await db
				.insert(loans)
				.values({ copyId, workId: c.work_id, editionId: c.edition_id, lenderId: c.owner, borrowerId: userId, status: 'requested', requestedAt: new Date(), note: cleanNote(note) })
				.returning({ id: loans.id });
			await tell(c.owner, 'loan_request', userId, { id: row!.id, workId: c.work_id });
			return row!.id;
		},

		/** Lender approves a request and sets the due date. */
		async approve(userId: string, loanId: string, dueOn: string | null, now = new Date()) {
			const l = await load(loanId);
			if (l.lenderId !== userId) throw new Forbidden();
			if (l.status !== 'requested') throw new LoanError('state');
			if (dueOn != null && !isIsoDate(dueOn)) throw new LoanError('invalid');
			if (await blockedBetween(l.lenderId, l.borrowerId)) throw new LoanError('blocked');
			const lentOn = await today(userId, now);
			await db.transaction(async (tx) => {
				const res = await tx
					.update(loans)
					.set({ status: 'active', lentOn, dueOn, updatedAt: now })
					.where(and(eq(loans.id, loanId), eq(loans.status, 'requested')))
					.returning({ id: loans.id })
					.catch((e: { code?: string; cause?: { code?: string } }) => {
						if (e.code === '23505' || e.cause?.code === '23505') throw new LoanError('taken');
						throw e;
					});
				if (!res.length) throw new LoanError('state');
				if (l.copyId) await tx.update(copies).set({ state: 'lent', updatedAt: now }).where(eq(copies.id, l.copyId));
			});
			await tell(l.borrowerId, 'loan_approved', userId, l, { dueOn });
		},

		async decline(userId: string, loanId: string) {
			const l = await load(loanId);
			if (l.lenderId !== userId) throw new Forbidden();
			const res = await db.update(loans).set({ status: 'declined', updatedAt: new Date() }).where(and(eq(loans.id, loanId), eq(loans.status, 'requested'))).returning({ id: loans.id });
			if (!res.length) throw new LoanError('state');
			await tell(l.borrowerId, 'loan_declined', userId, l);
		},

		/** Borrower withdraws their own request. */
		async cancel(userId: string, loanId: string) {
			const l = await load(loanId);
			if (l.borrowerId !== userId) throw new Forbidden();
			const res = await db.update(loans).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(loans.id, loanId), eq(loans.status, 'requested'))).returning({ id: loans.id });
			if (!res.length) throw new LoanError('state');
		},

		/**
		 * Borrower asks to keep it longer. With a lender outside the app (or for loans I lent to a name)
		 * the date just changes.
		 */
		async extend(userId: string, loanId: string, to: string) {
			const l = await load(loanId);
			if (l.status !== 'active') throw new LoanError('state');
			if (!isIsoDate(to) || (l.dueOn && to <= l.dueOn)) throw new LoanError('invalid');
			if (l.lenderId === userId || (l.borrowerId === userId && !l.lenderId)) {
				await db.update(loans).set({ dueOn: to, extensionTo: null, updatedAt: new Date() }).where(eq(loans.id, loanId));
				if (l.lenderId === userId && l.borrowerId) await tell(l.borrowerId, 'loan_extension_answer', userId, l, { approved: true, dueOn: to });
				return 'changed' as const;
			}
			if (l.borrowerId !== userId) throw new Forbidden();
			if (await blockedBetween(l.lenderId, l.borrowerId)) throw new LoanError('blocked');
			await db.update(loans).set({ extensionTo: to, updatedAt: new Date() }).where(eq(loans.id, loanId));
			await tell(l.lenderId, 'loan_extension_request', userId, l, { to });
			return 'requested' as const;
		},

		async answerExtension(userId: string, loanId: string, approve: boolean) {
			const l = await load(loanId);
			if (l.lenderId !== userId) throw new Forbidden();
			if (l.status !== 'active' || !l.extensionTo) throw new LoanError('state');
			const dueOn = approve ? l.extensionTo : l.dueOn;
			await db.update(loans).set({ dueOn, extensionTo: null, updatedAt: new Date() }).where(eq(loans.id, loanId));
			await tell(l.borrowerId, 'loan_extension_answer', userId, l, { approved: approve, dueOn });
		},

		/**
		 * Either side marks it returned. The lender's word (or a lender outside the app) closes the
		 * loan; the borrower's needs the lender to confirm.
		 */
		async markReturned(userId: string, loanId: string, now = new Date()) {
			const l = await load(loanId);
			if (l.lenderId !== userId && l.borrowerId !== userId) throw new Forbidden();
			if (l.status !== 'active') throw new LoanError('state');
			if (l.lenderId === userId || !l.lenderId) {
				const returnedOn = await today(userId, now);
				await db.transaction(async (tx) => {
					await tx.update(loans).set({ status: 'returned', returnedOn, extensionTo: null, updatedAt: now }).where(eq(loans.id, loanId));
					if (l.copyId) await tx.update(copies).set({ state: 'shelved', updatedAt: now }).where(and(eq(copies.id, l.copyId), eq(copies.state, 'lent')));
				});
				return 'returned' as const;
			}
			if (l.returnMarkedAt) return 'pending' as const;
			await db.update(loans).set({ returnMarkedAt: now, updatedAt: now }).where(eq(loans.id, loanId));
			await tell(l.lenderId, 'loan_returned', userId, l);
			return 'pending' as const;
		},

		/** Lender says "not back yet" after the borrower marked it returned. */
		async disputeReturn(userId: string, loanId: string) {
			const l = await load(loanId);
			if (l.lenderId !== userId) throw new Forbidden();
			await db.update(loans).set({ returnMarkedAt: null, updatedAt: new Date() }).where(and(eq(loans.id, loanId), eq(loans.status, 'active')));
		},

		/** Lender changes the due date or note of an active loan. */
		async edit(userId: string, loanId: string, patch: { dueOn?: string | null; note?: string }) {
			const l = await load(loanId);
			if (l.lenderId !== userId && !(l.borrowerId === userId && !l.lenderId)) throw new Forbidden();
			if (patch.dueOn != null && !isIsoDate(patch.dueOn)) throw new LoanError('invalid');
			await db
				.update(loans)
				.set({ ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn, extensionTo: null } : {}), ...(patch.note !== undefined ? { note: cleanNote(patch.note) } : {}), updatedAt: new Date() })
				.where(eq(loans.id, loanId));
		},

		/** Remove a loan I recorded by mistake (only when the other side is not a user). */
		async remove(userId: string, loanId: string) {
			const l = await load(loanId);
			const mineOnly = (l.lenderId === userId && !l.borrowerId) || (l.borrowerId === userId && !l.lenderId);
			if (!mineOnly) throw new Forbidden();
			await db.transaction(async (tx) => {
				await tx.delete(loans).where(eq(loans.id, loanId));
				if (l.status === 'active' && l.copyId) await tx.update(copies).set({ state: 'shelved' }).where(and(eq(copies.id, l.copyId), eq(copies.state, 'lent')));
			});
		},

		async get(userId: string, loanId: string) {
			if (!UUID.test(loanId)) return null;
			const [r] = await db.execute<Row>(select(sql`l.id = ${loanId} and (l.lender_id = ${userId} or l.borrower_id = ${userId})`));
			return r ? view(r, userId) : null;
		},

		/** Everything open: lent out, borrowed, requests in both directions. */
		async overview(userId: string, opts: { withUserId?: string } = {}) {
			const w = opts.withUserId ? sql`and (l.lender_id = ${opts.withUserId} or l.borrower_id = ${opts.withUserId})` : sql``;
			const rows = await db.execute<Row>(
				select(sql`(l.lender_id = ${userId} or l.borrower_id = ${userId}) and l.status in ('requested', 'active') ${w}`, sql`l.due_on asc nulls last, l.created_at desc`)
			);
			const all = rows.map((r) => view(r, userId));
			return {
				lent: all.filter((l) => l.status === 'active' && l.role === 'lender'),
				borrowed: all.filter((l) => l.status === 'active' && l.role === 'borrower'),
				incoming: all.filter((l) => l.status === 'requested' && l.role === 'lender'),
				outgoing: all.filter((l) => l.status === 'requested' && l.role === 'borrower')
			};
		},

		/** Finished loans, newest first — optionally only with one person or for one copy. */
		async history(userId: string, opts: { withUserId?: string; copyId?: string } = {}) {
			const w = [
				sql`(l.lender_id = ${userId} or l.borrower_id = ${userId}) and l.status = 'returned'`,
				opts.withUserId ? sql`(l.lender_id = ${opts.withUserId} or l.borrower_id = ${opts.withUserId})` : undefined,
				opts.copyId ? sql`l.copy_id = ${opts.copyId}` : undefined
			].filter(Boolean);
			const rows = await db.execute<Row>(select(sql.join(w as ReturnType<typeof sql>[], sql` and `), sql`l.returned_on desc nulls last, l.updated_at desc`));
			return rows.map((r) => view(r, userId));
		},

		/** All loans of copies in my households (book page, shelf view): active + returned history. */
		async forCopies(userId: string, copyIds: string[]) {
			const ids = copyIds.filter((x) => UUID.test(x));
			if (!ids.length) return new Map<string, { active: LoanView | null; history: LoanView[] }>();
			const rows = await db.execute<Row>(
				select(
					sql`l.copy_id in ${ids} and l.status in ('active', 'returned')
						and exists (select 1 from copies c join household_members hm on hm.household_id = c.household_id where c.id = l.copy_id and hm.user_id = ${userId})`,
					sql`l.lent_on desc nulls last, l.created_at desc`
				)
			);
			const out = new Map<string, { active: LoanView | null; history: LoanView[] }>();
			for (const r of rows) {
				const v = { ...view(r, userId), role: 'lender' as const };
				// Viewed from the household's side: the other party is always the borrower.
				v.other = { userId: r.borrower_id, handle: r.borrower_handle, name: r.borrower_display ?? r.borrower_name ?? '—', avatar: avatar(r.borrower_avatar) };
				const e = out.get(r.copy_id!) ?? { active: null, history: [] };
				if (r.status === 'active') e.active = v;
				else e.history.push(v);
				out.set(r.copy_id!, e);
			}
			return out;
		},

		/** What I have borrowed of these works (book page, bookstore mode). */
		async borrowedWorks(userId: string, workIds: string[]) {
			if (!workIds.length) return [];
			const rows = await db.execute<Row>(select(sql`l.borrower_id = ${userId} and l.status = 'active' and l.work_id in ${workIds}`));
			return rows.map((r) => view(r, userId));
		},

		/**
		 * Lendable copies of `ownerId` that `viewerId` may see (lending visibility), with my open
		 * request if any. Copies on loan are listed as unavailable.
		 */
		async lendable(viewerId: string, opts: { ownerId?: string; workId?: string }, limit = 100) {
			const rows = await db.execute<{
				copy_id: string;
				owner_id: string;
				handle: string;
				display_name: string;
				avatar_key: string | null;
				work_id: string;
				edition_id: string;
				title: string;
				authors: string[];
				cover_key: string | null;
				cover_source_url: string | null;
				state: string;
				requested: string | null;
				friends: boolean;
			}>(sql`
				select c.id as copy_id, c.owner_user_id as owner_id, p.handle, p.display_name, p.avatar_key, e.work_id, e.id as edition_id, e.title,
					coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = e.work_id), '{}') as authors,
					e.cover_key, e.cover_source_url, c.state,
					(select l.id from loans l where l.copy_id = c.id and l.borrower_id = ${viewerId} and l.status in ('requested', 'active') limit 1) as requested,
					exists (select 1 from friendships f where f.status = 'accepted' and f.user_low = least(${viewerId}::uuid, c.owner_user_id) and f.user_high = greatest(${viewerId}::uuid, c.owner_user_id)) as friends
				from copies c
				join editions e on e.id = c.edition_id
				join profiles p on p.user_id = c.owner_user_id
				where c.lendable and c.state <> 'lost' and c.owner_user_id <> ${viewerId}
					and p.hidden_at is null and p.suspended_at is null
					and can_view(${viewerId}, c.owner_user_id, p.lending_visibility)
					${opts.ownerId ? sql`and c.owner_user_id = ${opts.ownerId}` : sql``}
					${opts.workId ? sql`and e.work_id = ${opts.workId}` : sql``}
				order by friends desc, e.title
				limit ${limit}`);
			return rows.map((r) => ({
				copyId: r.copy_id,
				owner: { userId: r.owner_id, handle: r.handle, name: r.display_name, avatar: avatar(r.avatar_key) },
				workId: r.work_id,
				editionId: r.edition_id,
				title: r.title,
				authors: r.authors,
				cover: cover(r.cover_key, r.cover_source_url),
				available: r.state === 'shelved',
				requestedLoanId: r.requested,
				friends: r.friends
			}));
		},

		async setLendable(userId: string, copyId: string, lendable: boolean) {
			const c = await myCopy(userId, copyId);
			await db.update(copies).set({ lendable, updatedAt: new Date() }).where(eq(copies.id, c.id));
		},

		/**
		 * Hourly job: due-date reminders in each recipient's local day, from REMINDER_HOUR on.
		 * The notification dedupe key (loan, kind, due date, day, side) makes it exactly-once across
		 * replicas, restarts and repeated runs; an extension (new due date) restarts the schedule.
		 */
		async remind(now = new Date()) {
			const rows = await db.execute<{
				id: string;
				work_id: string;
				due_on: string;
				lender_id: string | null;
				lender_name: string | null;
				borrower_id: string | null;
				borrower_name: string | null;
				btz: string | null;
				ltz: string | null;
			}>(sql`
				select l.id, l.work_id, l.due_on::text, l.lender_id, l.lender_name, l.borrower_id, l.borrower_name, bp.timezone as btz, lp.timezone as ltz
				from loans l
				left join profiles bp on bp.user_id = l.borrower_id
				left join profiles lp on lp.user_id = l.lender_id
				where l.status = 'active' and l.due_on is not null and l.due_on <= ${now.toISOString().slice(0, 10)}::date + 9`);
			let sent = 0;
			for (const l of rows) {
				const sides: ['b' | 'l', string | null, string | null][] = [
					['b', l.borrower_id, l.btz],
					['l', l.lender_id, l.ltz]
				];
				for (const [side, uid, tz] of sides) {
					if (!uid) continue;
					const zone = tz ?? 'Europe/Warsaw';
					if (localHour(now, zone) < REMINDER_HOUR) continue;
					const r = reminderFor(l.due_on, localDate(now, zone));
					if (!r || (r.kind === 'due_soon' && side === 'l')) continue;
					const actorId = side === 'b' ? l.lender_id : l.borrower_id;
					const otherName = side === 'b' ? l.lender_name : l.borrower_name;
					const id = await notifications.notify(uid, r.kind === 'due_soon' ? 'loan_due' : 'loan_overdue', {
						actorId,
						data: { url: `/loans#loan-${l.id}`, loanId: l.id, title: await titleOf(l.work_id), days: r.days, dueOn: l.due_on, side, otherName },
						dedupeKey: `loan:${l.id}:${r.kind}:${l.due_on}:${r.days}:${side}`
					});
					if (id) sent++;
				}
			}
			return sent;
		},

		/** For the bookstore verdict and the cached library: who has my copies. */
		async activeByCopy(userId: string) {
			const rows = await db.execute<{ copy_id: string; due_on: string | null; name: string }>(sql`
				select l.copy_id, l.due_on::text, coalesce(bp.display_name, l.borrower_name, '—') as name
				from loans l
				join copies c on c.id = l.copy_id
				join household_members hm on hm.household_id = c.household_id and hm.user_id = ${userId}
				left join profiles bp on bp.user_id = l.borrower_id
				where l.status = 'active'`);
			return new Map(rows.map((r) => [r.copy_id, { to: r.name, dueOn: r.due_on }]));
		}
	};
	return api;
}

export type Loans = ReturnType<typeof createLoans>;
