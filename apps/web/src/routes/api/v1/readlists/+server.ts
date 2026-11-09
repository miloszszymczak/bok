import { LIST_VISIBILITIES, type ListVisibility } from '@bok/server';
import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** GET ?workId= — my lists, flagged where this work already is (the "Add to list" sheet). */
export const GET: RequestHandler = async ({ url, locals }) => {
	const user = await requireUser(locals);
	const workId = url.searchParams.get('workId') ?? '';
	if (!UUID.test(workId)) error(400, 'workId is required');
	return json(await locals.svc.readlists.forWork(user.id, workId));
};

/** POST { title, visibility?, workId?, editionId? } — create a list (optionally with a first book). */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'list-create', max: 30, windowSec: 3600 });
	const b = (await request.json().catch(() => null)) as { title?: unknown; visibility?: unknown; workId?: unknown; editionId?: unknown } | null;
	const title = typeof b?.title === 'string' ? b.title.trim() : '';
	if (!title) error(400, 'title is required');
	const visibility = LIST_VISIBILITIES.includes(b?.visibility as ListVisibility) ? (b!.visibility as ListVisibility) : 'private';
	const l = await locals.svc.readlists.create(user.id, { title, visibility });
	if (typeof b?.workId === 'string' && UUID.test(b.workId)) {
		await guard(() => locals.svc.readlists.addItem(user.id, l.id, b.workId as string, typeof b.editionId === 'string' && UUID.test(b.editionId) ? b.editionId : null));
	}
	return json({ id: l.id, slug: l.slug });
};
