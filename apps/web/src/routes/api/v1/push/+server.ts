import { error, json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** POST a PushSubscription (from pushManager.subscribe) for this device; DELETE { endpoint } removes it. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'push', max: 20, windowSec: 3600 });
	const b = (await request.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
	if (typeof b?.endpoint !== 'string' || !b.endpoint.startsWith('https://') || typeof b.keys?.p256dh !== 'string' || typeof b.keys.auth !== 'string') error(400, 'invalid subscription');
	await locals.svc.notifications.subscribe(user.id, { endpoint: b.endpoint, keys: { p256dh: b.keys.p256dh, auth: b.keys.auth } }, request.headers.get('user-agent') ?? '');
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals);
	const b = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
	if (typeof b?.endpoint === 'string') await locals.svc.notifications.unsubscribe(user.id, b.endpoint);
	return json({ ok: true });
};
