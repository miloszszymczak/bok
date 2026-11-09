import { error, json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import { invalidAs400, visibilityOf } from '#lib/server/posts-api.ts';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'post-edit', max: 60, windowSec: 3600 });
	const b = (await request.json().catch(() => null)) as { body?: unknown; visibility?: unknown; spoiler?: unknown } | null;
	if (typeof b?.body !== 'string') error(400, 'body is required');
	await invalidAs400(() => guard(() => locals.svc.posts.update(user.id, params.id, { body: b.body as string, visibility: visibilityOf(b.visibility), spoiler: typeof b.spoiler === 'boolean' ? b.spoiler : undefined })));
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = await requireUser(locals);
	await guard(() => locals.svc.posts.remove(user.id, params.id));
	return json({ ok: true });
};
