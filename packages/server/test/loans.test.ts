/**
 * Lending integration tests (real Postgres; TEST_DATABASE_URL). Includes the phase-8 criterion:
 * a clock simulation where two "replicas" run the hourly reminder job concurrently and every
 * reminder day produces exactly one notification per loan and side.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, localDate } from '@bok/core';
import { copies, createDb, notifications as notifTable, profiles, user } from '@bok/db';
import { runMigrations } from '@bok/db/migrate';
import type { LookupResult, MetadataClient } from '@bok/metadata';
import { and, eq, sql } from 'drizzle-orm';
import { createAccounts } from '../src/accounts.ts';
import { createCatalog } from '../src/catalog.ts';
import { createShelves } from '../src/shelves.ts';
import { createLibrary } from '../src/library.ts';
import { createNotifications } from '../src/notifications.ts';
import { createSocial } from '../src/social.ts';
import { createLoans, LoanError } from '../src/loans.ts';
import type { Mailer } from '../src/email.ts';
import type { Queue } from '../src/queue.ts';
import type { Storage } from '../src/storage.ts';
import type { Kv } from '../src/valkey.ts';

const url = process.env.TEST_DATABASE_URL;
const BOOKS: Record<string, string> = { '9780547928227': 'The Hobbit', '9788378865759': 'Bóg i geometria' };
const fakeMetadata: MetadataClient = {
	providers: ['openlibrary'],
	async lookup(id) {
		const title = id.kind === 'isbn' ? BOOKS[id.isbn13] : undefined;
		return {
			identifier: id,
			merged: title ? { title, contributors: [{ name: 'A. Author', role: 'author' }] } : null,
			quality: title ? 50 : 0,
			results: [{ provider: 'openlibrary', status: title ? 'hit' : 'miss', ms: 1, record: {}, raw: {} }]
		} as LookupResult;
	}
};
const kv = (() => {
	const m = new Map<string, string>();
	return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => (m.set(k, v), 'OK'), del: async () => 1, incr: async () => 1, expire: async () => 1 } as unknown as Kv;
})();
const noQueue = { send: async () => null } as unknown as Queue;
const storage = { url: (k: string) => `/media/${k}`, put: async () => {} } as unknown as Storage;

describe.skipIf(!url)('lending (integration)', () => {
	const { db, client } = createDb(url ?? 'postgres://unused', { max: 6 });
	const mailer: Mailer = { send: async () => {} };
	const catalog = createCatalog({ db, kv, metadata: fakeMetadata, queue: noQueue });
	const accounts = createAccounts(db, kv, { adminEmails: [] });
	const shelves = createShelves({ db, storage });
	const library = createLibrary({ db, catalog, accounts, storage, shelves });
	const notifications = createNotifications({ db, mailer, cfg: { origin: 'http://localhost' } });
	const social = createSocial({ db, kv, storage, notifications });
	const loans = createLoans({ db, storage, notifications });
	// A second "replica": separate pool and service instances, same database.
	const replica = createDb(url ?? 'postgres://unused', { max: 6 });
	const loans2 = createLoans({ db: replica.db, storage, notifications: createNotifications({ db: replica.db, mailer, cfg: { origin: 'http://localhost' } }) });
	const ids: Record<string, string> = {};
	let copyId = '';
	let workId = '';

	beforeAll(async () => {
		await runMigrations(url!);
	});
	afterAll(async () => {
		await client.end();
		await replica.client.end();
	});
	beforeEach(async () => {
		await db.execute(sql`truncate "user", households, works, authors, editions, tags cascade`);
		for (const n of ['lender', 'friend', 'stranger', 'follower']) {
			const [u] = await db.insert(user).values({ name: n, email: `${n}@test.local` }).returning({ id: user.id });
			await accounts.bootstrap({ id: u!.id, name: n, email: `${n}@test.local` }, 'en');
			ids[n] = u!.id;
		}
		await social.requestFriend(ids.friend!, ids.lender!);
		await social.acceptFriend(ids.lender!, ids.friend!);
		await social.follow(ids.follower!, ids.lender!);
		const r = await library.scanAdd({ userId: ids.lender!, clientId: crypto.randomUUID(), code: '9780547928227' });
		if (r.status !== 'added') throw new Error('setup');
		copyId = r.copy.id;
		workId = r.book.workId;
	});

	const count = (userId: string, type: string) =>
		db.$count(notifTable, and(eq(notifTable.userId, userId), eq(notifTable.type, type)));
	const copyState = async () => (await db.query.copies.findFirst({ where: eq(copies.id, copyId) }))!.state;

	it('lendable copies follow lending visibility (friends by default); requests go through approve → return → confirm', async () => {
		expect(await loans.lendable(ids.friend!, { ownerId: ids.lender! })).toHaveLength(0); // not lendable yet
		await loans.setLendable(ids.lender!, copyId, true);
		expect(await loans.lendable(ids.friend!, { ownerId: ids.lender! })).toHaveLength(1);
		expect(await loans.lendable(ids.follower!, { ownerId: ids.lender! })).toHaveLength(0);
		await expect(loans.request(ids.stranger!, copyId)).rejects.toThrow();

		const id = await loans.request(ids.friend!, copyId, 'please!');
		await expect(loans.request(ids.friend!, copyId)).rejects.toBeInstanceOf(LoanError);
		expect(await count(ids.lender!, 'loan_request')).toBe(1);
		expect((await loans.overview(ids.lender!)).incoming).toHaveLength(1);
		await expect(loans.approve(ids.friend!, id, '2026-12-01')).rejects.toThrow();

		await loans.approve(ids.lender!, id, '2026-12-01');
		expect(await copyState()).toBe('lent');
		expect(await count(ids.friend!, 'loan_approved')).toBe(1);
		const ov = await loans.overview(ids.friend!);
		expect(ov.borrowed[0]).toMatchObject({ id, dueOn: '2026-12-01', role: 'borrower', other: { userId: ids.lender } });

		// Extension: borrower asks, lender approves.
		expect(await loans.extend(ids.friend!, id, '2026-12-15')).toBe('requested');
		expect(await count(ids.lender!, 'loan_extension_request')).toBe(1);
		await loans.answerExtension(ids.lender!, id, true);
		expect((await loans.get(ids.friend!, id))!.dueOn).toBe('2026-12-15');

		// Borrower marks returned → pending until the lender confirms.
		expect(await loans.markReturned(ids.friend!, id)).toBe('pending');
		expect(await copyState()).toBe('lent');
		expect(await count(ids.lender!, 'loan_returned')).toBe(1);
		expect(await loans.markReturned(ids.lender!, id)).toBe('returned');
		expect(await copyState()).toBe('shelved');
		const hist = await loans.history(ids.lender!, { copyId });
		expect(hist).toHaveLength(1);
		expect(hist[0]!.other.userId).toBe(ids.friend);
		expect(await loans.history(ids.friend!, { withUserId: ids.lender! })).toHaveLength(1);
	});

	it('lends to a name, refuses a second loan of the same copy, and records books borrowed from outside', async () => {
		await loans.lend(ids.lender!, { copyId, borrowerName: '  Ola  ', dueOn: '2026-12-12' });
		await expect(loans.lend(ids.lender!, { copyId, borrowerId: ids.friend! })).rejects.toMatchObject({ code: 'taken' });
		const map = await loans.forCopies(ids.lender!, [copyId]);
		expect(map.get(copyId)!.active!.other.name).toBe('Ola');
		const b = await loans.recordBorrow(ids.friend!, { workId, lenderName: 'City library', dueOn: '2026-11-20' });
		const v = await loans.get(ids.friend!, b);
		expect(v).toMatchObject({ role: 'borrower', other: { userId: null, name: 'City library' } });
		// Lender outside the app: an extension just changes the date, a return closes it.
		expect(await loans.extend(ids.friend!, b, '2026-11-30')).toBe('changed');
		expect(await loans.markReturned(ids.friend!, b)).toBe('returned');
		await expect(loans.lend(ids.stranger!, { copyId, borrowerName: 'x' })).rejects.toThrow(); // not their copy
	});

	it('blocking cancels pending requests and stops lending interactions', async () => {
		await loans.setLendable(ids.lender!, copyId, true);
		await db.update(profiles).set({ lendingVisibility: 'public' }).where(eq(profiles.userId, ids.lender!));
		const id = await loans.request(ids.stranger!, copyId);
		await social.block(ids.lender!, ids.stranger!);
		expect((await loans.get(ids.lender!, id))!.status).toBe('cancelled');
		expect(await loans.lendable(ids.stranger!, { ownerId: ids.lender! })).toHaveLength(0);
		await expect(loans.request(ids.stranger!, copyId)).rejects.toThrow();
		await expect(loans.lend(ids.lender!, { copyId, borrowerId: ids.stranger! })).rejects.toMatchObject({ code: 'blocked' });
	});

	it('clock simulation: exactly one reminder per reminder day per loan, across two replicas and repeated runs', async () => {
		// Borrower in Warsaw, lender in New York: each side gets its reminders in its own local day.
		await db.update(profiles).set({ timezone: 'America/New_York' }).where(eq(profiles.userId, ids.lender!));
		const start = new Date('2026-11-01T00:30:00Z');
		const due = addDays(localDate(start, 'Europe/Warsaw'), 10);
		await loans.lend(ids.lender!, { copyId, borrowerId: ids.friend!, dueOn: due });
		const out = await loans.recordBorrow(ids.friend!, { workId, lenderName: 'Library', dueOn: addDays(due, 2) });

		let sent = 0;
		for (let h = 0; h < 30 * 24; h++) {
			const now = new Date(start.getTime() + h * 3_600_000);
			// Both replicas fire the hourly job; one of them also re-runs it (a restart / retry).
			const [a, b, c] = await Promise.all([loans.remind(now), loans2.remind(now), h % 5 === 0 ? loans.remind(now) : Promise.resolve(0)]);
			sent += a + b + c;
		}
		const rows = await db.select({ userId: notifTable.userId, type: notifTable.type, data: notifTable.data, key: notifTable.dedupeKey }).from(notifTable).where(sql`${notifTable.type} in ('loan_due', 'loan_overdue')`);
		const days = (uid: string, type: string, loanId?: string) =>
			rows.filter((r) => r.userId === uid && r.type === type && (!loanId || (r.data as { loanId: string }).loanId === loanId)).map((r) => (r.data as { days: number }).days).sort((x, y) => x - y);

		// The 30 simulated days cover due − 10 … due + 19: overdue days 1, 8 and 15.
		const loanId = (await loans.overview(ids.lender!)).lent[0]!.id;
		expect(days(ids.friend!, 'loan_due', loanId)).toEqual([0, 1, 3, 7]);
		expect(days(ids.friend!, 'loan_overdue', loanId)).toEqual([1, 8, 15]);
		expect(days(ids.lender!, 'loan_overdue', loanId)).toEqual([1, 8, 15]);
		expect(days(ids.lender!, 'loan_due')).toEqual([]); // the lender only hears about overdue loans
		expect(days(ids.friend!, 'loan_due', out)).toEqual([0, 1, 3, 7]); // borrowed from outside works too
		expect(sent).toBe(rows.length);
		expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);

	});

	it('an extension restarts the schedule for the new date; returned loans get no reminders', async () => {
		const now = new Date('2026-11-01T10:00:00Z'); // 11:00 in Warsaw
		const today = localDate(now, 'Europe/Warsaw');
		const id = await loans.lend(ids.lender!, { copyId, borrowerId: ids.friend!, dueOn: addDays(today, 3) });
		expect(await loans.remind(new Date('2026-11-01T07:00:00Z'))).toBe(0); // 8:00 local: not yet
		expect(await loans.remind(now)).toBe(1);
		await loans.edit(ids.lender!, id, { dueOn: addDays(today, 7) });
		expect(await loans.remind(now)).toBe(1); // new due date → its own 7-day reminder
		expect(await loans.remind(now)).toBe(0);
		await loans.markReturned(ids.lender!, id);
		await loans.edit(ids.lender!, id, { dueOn: addDays(today, 1) });
		expect(await loans.remind(now)).toBe(0);
	});
});
