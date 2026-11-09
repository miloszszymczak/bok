import { foldText, slugify } from '@bok/core';
import { householdMembers, households, profiles, session, user, type Db } from '@bok/db';
import type { Kv } from './valkey.ts';
import type { Storage } from './storage.ts';
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';

export const DELETION_GRACE_DAYS = 14;
export const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
const RESERVED = new Set(['admin', 'api', 'auth', 'book', 'books', 'isbn', 'l', 'lists', 'media', 'me', 'new', 'scan', 'search', 'settings', 'u', 'bok', 'support', 'help']);

export function isHandleAvailableSyntax(h: string) {
	return HANDLE_RE.test(h) && !RESERVED.has(h);
}

export function createAccounts(db: Db, kv: Kv, opts: { adminEmails: string[]; storage?: Storage }) {
	const admins = new Set(opts.adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));

	async function uniqueHandle(seed: string): Promise<string> {
		const base = (slugify(seed, 20).replace(/-/g, '_') || 'reader').padEnd(3, '_');
		for (let i = 0; i < 20; i++) {
			const candidate = i === 0 && !RESERVED.has(base) ? base : `${base}_${Math.floor(Math.random() * 10 ** (2 + Math.min(i, 4)))}`;
			const taken = await db.query.profiles.findFirst({ where: eq(profiles.handle, candidate), columns: { userId: true } });
			if (!taken) return candidate;
		}
		return `reader_${Date.now().toString(36)}`;
	}

	return {
		/** Called right after sign-up: profile with a generated handle + a default household. */
		async bootstrap(u: { id: string; name: string; email: string }, locale: string) {
			const handle = await uniqueHandle(u.name || u.email.split('@')[0]!);
			await db.transaction(async (tx) => {
				await tx
					.insert(profiles)
					.values({
						userId: u.id,
						handle,
						displayName: u.name || handle,
						searchName: foldText(`${u.name || handle} ${handle}`),
						locale,
						role: admins.has(u.email.toLowerCase()) ? 'admin' : 'user'
					})
					.onConflictDoNothing();
				const [h] = await tx.insert(households).values({ name: u.name || handle, createdBy: u.id }).returning({ id: households.id });
				await tx.insert(householdMembers).values({ householdId: h!.id, userId: u.id, role: 'owner', isDefault: true });
			});
		},

		async getProfile(userId: string) {
			return db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
		},

		async defaultHouseholdId(userId: string): Promise<string | null> {
			const m = await db.query.householdMembers.findFirst({
				where: eq(householdMembers.userId, userId),
				orderBy: (t, { desc }) => [desc(t.isDefault), t.createdAt],
				columns: { householdId: true }
			});
			return m?.householdId ?? null;
		},

		isAdmin(email: string, role?: string | null) {
			return role === 'admin' || admins.has(email.toLowerCase());
		},

		/** Marks the account; the caller revokes other sessions through better-auth (they live in Valkey too). */
		async requestDeletion(userId: string) {
			await db.update(profiles).set({ deletionRequestedAt: new Date() }).where(eq(profiles.userId, userId));
		},

		async cancelDeletion(userId: string) {
			await db.update(profiles).set({ deletionRequestedAt: null }).where(eq(profiles.userId, userId));
		},

		/** Hard-deletes accounts past the grace period, then households nobody belongs to. */
		async purgeDue(now = new Date()): Promise<number> {
			const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000);
			const due = await db
				.select({ id: profiles.userId })
				.from(profiles)
				.where(and(isNotNull(profiles.deletionRequestedAt), lt(profiles.deletionRequestedAt, cutoff)));
			for (const { id } of due) {
				// better-auth keeps sessions in Valkey as well; drop them so no ghost session survives.
				const tokens = await db.select({ token: session.token }).from(session).where(eq(session.userId, id));
				for (const { token } of tokens) await kv.del(`auth:${token}`);
				await kv.del(`auth:active-sessions-${id}`);
				// Loans with someone who stays: keep their record, with this person as just a name
				// (otherwise the cascade would leave the lender's copy "lent" forever). Open requests end.
				await db.execute(sql`update loans set status = 'cancelled', updated_at = now() where status = 'requested' and (lender_id = ${id} or borrower_id = ${id})`);
				await db.execute(sql`
					update loans l set borrower_name = coalesce(l.borrower_name, p.display_name), borrower_id = null, updated_at = now()
					from profiles p where p.user_id = l.borrower_id and l.borrower_id = ${id} and l.lender_id is not null`);
				await db.execute(sql`
					update loans l set lender_name = coalesce(l.lender_name, p.display_name), lender_id = null, updated_at = now()
					from profiles p where p.user_id = l.lender_id and l.lender_id = ${id} and l.borrower_id is not null`);
				const avatar = (await db.query.profiles.findFirst({ where: eq(profiles.userId, id), columns: { avatarKey: true } }))?.avatarKey;
				await db.delete(user).where(eq(user.id, id));
				// Uploaded files go too (GDPR): the avatar lives in R2, not in the database.
				if (avatar && opts.storage) await opts.storage.delete(avatar).catch(() => {});
			}
			await db.execute(sql`delete from households h where not exists (select 1 from household_members m where m.household_id = h.id)`);
			return due.length;
		}
	};
}

export type Accounts = ReturnType<typeof createAccounts>;
