import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** Owned editions with their copies — cached on the device for offline bookstore mode. */
export const GET: RequestHandler = async ({ locals }) => {
	const user = await requireUser(locals, { key: 'snapshot', max: 30, windowSec: 60 });
	const [editions, reading] = await Promise.all([locals.svc.library.snapshot(user.id), locals.svc.reading.cache(user.id)]);
	return json({ editions, reading, at: new Date().toISOString() }, { headers: { 'cache-control': 'private, no-store' } });
};
