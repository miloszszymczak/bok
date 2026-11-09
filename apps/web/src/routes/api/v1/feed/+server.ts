import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** GET ?cursor= — next page of the home feed. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const user = await requireUser(locals, { key: 'feed', max: 240, windowSec: 60 });
	return json(await locals.svc.posts.feed(user.id, url.searchParams.get('cursor')), { headers: { 'cache-control': 'private, no-store' } });
};
