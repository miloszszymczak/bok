import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** POST { copyIds: string[], sectionId: string | null } — null means Unsorted. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'move', max: 120, windowSec: 60 });
	const body = (await request.json().catch(() => null)) as { copyIds?: unknown; sectionId?: unknown } | null;
	const ids = Array.isArray(body?.copyIds) ? body.copyIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 500) : [];
	const sectionId = body?.sectionId === null ? null : typeof body?.sectionId === 'string' && UUID.test(body.sectionId) ? body.sectionId : undefined;
	if (!ids.length || sectionId === undefined) error(400, 'copyIds and sectionId are required');
	const moved = await guard(() => locals.svc.shelves.moveCopies(user.id, ids, sectionId));
	return json({ moved });
};
