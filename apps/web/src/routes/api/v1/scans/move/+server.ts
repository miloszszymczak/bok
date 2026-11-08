import { error, json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** POST { code, sectionId } — "move" scan: put my copy of this book on that shelf. Idempotent. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'scan', max: 240, windowSec: 60 });
	const body = (await request.json().catch(() => null)) as { code?: unknown; sectionId?: unknown } | null;
	if (typeof body?.code !== 'string' || typeof body.sectionId !== 'string') error(400, 'code and sectionId are required');
	return json(await guard(() => locals.svc.library.scanMove({ userId: user.id, code: (body.code as string).slice(0, 32), sectionId: body.sectionId as string })));
};
