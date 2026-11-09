import { Forbidden, NotFound, rateLimit } from '@bok/server';
import { error } from '@sveltejs/kit';

/** Signed-in user or 401; optional per-user rate limit. */
export async function requireUser(locals: App.Locals, limit?: { key: string; max: number; windowSec: number }) {
	if (!locals.user) error(401, 'Sign in required');
	if (limit && !(await rateLimit(locals.svc.kv, `${limit.key}:${locals.user.id}`, limit.max, limit.windowSec))) {
		error(429, 'Too many requests, slow down a little.');
	}
	return locals.user;
}


/** Map service errors to HTTP errors (403/404) instead of 500s. */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof Forbidden) error(403, 'Not your library');
		if (e instanceof NotFound) error(404, 'Not found');
		// A malformed id from the URL/body (invalid uuid / date syntax) is a missing thing, not a crash.
		const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
		if (code === '22P02' || code === '22007' || code === '22008') error(404, 'Not found');
		throw e;
	}
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
