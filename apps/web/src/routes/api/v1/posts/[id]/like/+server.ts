import { json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	const user = await requireUser(locals, { key: 'like', max: 600, windowSec: 3600 });
	await guard(() => locals.svc.posts.like(user.id, 'post', params.id));
	return json({ ok: true });
};
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = await requireUser(locals);
	await locals.svc.posts.unlike(user.id, 'post', params.id);
	return json({ ok: true });
};
