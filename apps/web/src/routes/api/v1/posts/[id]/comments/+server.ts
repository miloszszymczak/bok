import { error, json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import { invalidAs400 } from '#lib/server/posts-api.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'comment', max: 120, windowSec: 3600 });
	const b = (await request.json().catch(() => null)) as { body?: unknown; spoiler?: unknown } | null;
	if (typeof b?.body !== 'string') error(400, 'body is required');
	const id = await invalidAs400(() => guard(() => locals.svc.posts.addComment(user.id, params.id, { body: b.body as string, spoiler: b.spoiler === true })));
	return json({ id });
};
