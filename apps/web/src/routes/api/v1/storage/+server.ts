import { json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** Rooms → bookcases → shelves of the active household (cached on the device for the scan target picker). */
export const GET: RequestHandler = async ({ locals }) => {
	const user = await requireUser(locals, { key: 'storage', max: 60, windowSec: 60 });
	return json(await guard(() => locals.svc.shelves.tree(user.id)), { headers: { 'cache-control': 'private, no-store' } });
};
