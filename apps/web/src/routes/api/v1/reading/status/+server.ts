import { STATUSES, type Status } from '@bok/server';
import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** POST { workId, status } — one-tap status from a book card. null clears it. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'status', max: 120, windowSec: 60 });
	const b = (await request.json().catch(() => null)) as { workId?: unknown; status?: unknown } | null;
	if (typeof b?.workId !== 'string' || !UUID.test(b.workId)) error(400, 'workId is required');
	const status = b.status === null ? null : STATUSES.includes(b.status as Status) ? (b.status as Status) : undefined;
	if (status === undefined) error(400, 'invalid status');
	await guard(() => locals.svc.reading.setStatus(user.id, b.workId as string, status));
	return json({ status });
};
