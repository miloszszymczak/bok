import { LoanError } from '@bok/server';
import { profiles } from '@bok/db';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { guard } from './api.ts';

/** Service errors → HTTP: wrong state / already lent → 409, bad input → 400, blocked → 403. */
export async function loanGuard<T>(fn: () => Promise<T>): Promise<T> {
	return guard(async () => {
		try {
			return await fn();
		} catch (e) {
			if (e instanceof LoanError) error(e.code === 'blocked' ? 403 : e.code === 'invalid' ? 400 : 409, e.code);
			throw e;
		}
	});
}

export async function userIdByHandle(locals: App.Locals, handle: unknown) {
	if (typeof handle !== 'string' || !handle) return null;
	const p = await locals.svc.db.query.profiles.findFirst({ where: eq(profiles.handle, handle.replace(/^@/, '')), columns: { userId: true } });
	if (!p) error(400, 'unknown user');
	return p.userId;
}

export const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
export const dateOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
