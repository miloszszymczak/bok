import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** PUT { code: string | null } — stick a barcode on this shelf (or remove it). 409 when another shelf has it. */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'shelf-code', max: 120, windowSec: 3600 });
	if (!UUID.test(params.id)) error(404);
	const b = (await request.json().catch(() => null)) as { code?: unknown } | null;
	if (!b || (b.code !== null && typeof b.code !== 'string')) error(400, 'code must be a string or null');
	const r = await guard(() => locals.svc.shelves.setSectionCode(user.id, params.id, b.code as string | null));
	if (r.ok) return json(r);
	return json(r, { status: r.reason === 'taken' ? 409 : 400 });
};
