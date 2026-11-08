import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** DELETE — remove a copy (used by Undo). Idempotent. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = await requireUser(locals, { key: 'copy-delete', max: 120, windowSec: 60 });
	const removed = await locals.svc.library.removeCopy(user.id, params.id);
	return json({ removed });
};
