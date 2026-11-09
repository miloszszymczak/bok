import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** GET — everything tied to my account, as JSON (GDPR data export). */
export const GET: RequestHandler = async ({ locals }) => {
	const user = await requireUser(locals, { key: 'export', max: 10, windowSec: 600 });
	const data = await locals.svc.exports.fullJson(user.id);
	return new Response(JSON.stringify(data, null, 1), {
		headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="bok-data-${new Date().toISOString().slice(0, 10)}.json"`, 'cache-control': 'private, no-store' }
	});
};
