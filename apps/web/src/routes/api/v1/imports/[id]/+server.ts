import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import { importGuard } from '#lib/server/imports-api.ts';
import type { RequestHandler } from './$types';

/** GET — status + progress (polled by the import page while it runs). */
export const GET: RequestHandler = async ({ params, locals }) => {
	const user = await requireUser(locals, { key: 'import-poll', max: 240, windowSec: 60 });
	return json(await importGuard(() => locals.svc.imports.get(user.id, params.id)), { headers: { 'cache-control': 'no-store' } });
};
