import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/**
 * PUT { layout, orphansTo? } — 409 with the affected shelves when removed shelves still hold
 * books and `orphansTo` (a shelf id, or null for Unsorted) wasn't given.
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'layout', max: 60, windowSec: 60 });
	const body = (await request.json().catch(() => null)) as { layout?: unknown; orphansTo?: unknown } | null;
	if (!body?.layout) error(400, 'layout is required');
	const orphansTo = body.orphansTo === null ? null : typeof body.orphansTo === 'string' && UUID.test(body.orphansTo) ? body.orphansTo : undefined;
	let res;
	try {
		res = await guard(() => locals.svc.shelves.setLayout(user.id, params.id, body.layout, orphansTo));
	} catch (e) {
		if (e instanceof Error && /layout|column|shelf/.test(e.message)) error(400, e.message);
		throw e;
	}
	return json(res, { status: res.ok ? 200 : 409 });
};
