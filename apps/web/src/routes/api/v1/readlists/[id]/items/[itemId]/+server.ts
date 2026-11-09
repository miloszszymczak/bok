import { json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** PATCH { note } — note on one entry. DELETE — remove the entry. */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'list-edit', max: 240, windowSec: 60 });
	const b = (await request.json().catch(() => null)) as { note?: unknown } | null;
	await guard(() => locals.svc.readlists.setNote(user.id, params.id, params.itemId, typeof b?.note === 'string' ? b.note : ''));
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = await requireUser(locals, { key: 'list-edit', max: 240, windowSec: 60 });
	await guard(() => locals.svc.readlists.removeItem(user.id, params.id, params.itemId));
	return json({ ok: true });
};
