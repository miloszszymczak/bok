import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** POST { itemId, afterId } — place itemId right after afterId (null = top). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'list-edit', max: 240, windowSec: 60 });
	const b = (await request.json().catch(() => null)) as { itemId?: unknown; afterId?: unknown } | null;
	if (typeof b?.itemId !== 'string' || !UUID.test(b.itemId)) error(400, 'itemId is required');
	const afterId = typeof b.afterId === 'string' && UUID.test(b.afterId) ? b.afterId : null;
	const position = await guard(() => locals.svc.readlists.move(user.id, params.id, b.itemId as string, afterId));
	return json({ position });
};
