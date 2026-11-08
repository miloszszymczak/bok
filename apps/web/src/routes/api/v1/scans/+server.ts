import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/**
 * POST { id, code, force?, sectionId? } — add one scanned book. `id` is generated on the device (UUIDv7)
 * and becomes the copy id, so the offline queue can retry safely.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'scan', max: 240, windowSec: 60 });
	const body = (await request.json().catch(() => null)) as { id?: unknown; code?: unknown; force?: unknown; sectionId?: unknown } | null;
	if (!body || typeof body.id !== 'string' || typeof body.code !== 'string') error(400, 'id and code are required');
	const sectionId = typeof body.sectionId === 'string' && UUID.test(body.sectionId) ? body.sectionId : null;
	const result = await guard(() =>
		locals.svc.library.scanAdd({ userId: user.id, clientId: body.id as string, code: (body.code as string).slice(0, 32), force: body.force === true, sectionId })
	);
	return json(result);
};
