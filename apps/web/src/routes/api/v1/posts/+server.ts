import { error, json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import { invalidAs400, visibilityOf } from '#lib/server/posts-api.ts';
import type { RequestHandler } from './$types';

/** POST { body, visibility?, spoiler? } — body in canonical post format. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'post', max: 30, windowSec: 3600 });
	const b = (await request.json().catch(() => null)) as { body?: unknown; visibility?: unknown; spoiler?: unknown } | null;
	if (typeof b?.body !== 'string') error(400, 'body is required');
	const id = await invalidAs400(() => locals.svc.posts.create(user.id, { body: b.body as string, visibility: visibilityOf(b.visibility), spoiler: b.spoiler === true }));
	return json({ id });
};
