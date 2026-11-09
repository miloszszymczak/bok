import { json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = await requireUser(locals);
	await guard(() => locals.svc.posts.deleteComment(user.id, params.id));
	return json({ ok: true });
};
