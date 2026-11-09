import { error, json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** DELETE — remove a copy (used by Undo). Idempotent. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = await requireUser(locals, { key: 'copy-delete', max: 120, windowSec: 60 });
	const removed = await locals.svc.library.removeCopy(user.id, params.id);
	return json({ removed });
};

/** PATCH { lendable } — may friends ask to borrow this copy? */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'copy-edit', max: 120, windowSec: 60 });
	const b = (await request.json().catch(() => null)) as { lendable?: unknown } | null;
	if (typeof b?.lendable !== 'boolean') error(400);
	await guard(() => locals.svc.loans.setLendable(user.id, params.id, b.lendable as boolean));
	return json({ lendable: b.lendable });
};
