import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

const body = async (request: Request) => (await request.json().catch(() => null)) as { workId?: unknown; editionId?: unknown } | null;

/** POST { workId, editionId? } — add a book. DELETE { workId } — take it off this list. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'list-edit', max: 240, windowSec: 60 });
	const b = await body(request);
	if (typeof b?.workId !== 'string' || !UUID.test(b.workId)) error(400, 'workId is required');
	const id = await guard(() => locals.svc.readlists.addItem(user.id, params.id, b.workId as string, typeof b.editionId === 'string' && UUID.test(b.editionId) ? b.editionId : null));
	return json({ id });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'list-edit', max: 240, windowSec: 60 });
	const b = await body(request);
	if (typeof b?.workId !== 'string' || !UUID.test(b.workId)) error(400, 'workId is required');
	await guard(() => locals.svc.readlists.removeWork(user.id, params.id, b.workId as string));
	return json({ ok: true });
};
