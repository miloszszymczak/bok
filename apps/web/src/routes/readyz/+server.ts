import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		await Promise.all([locals.svc.db.execute(sql`select 1`), locals.svc.kv.ping()]);
		return new Response('ready');
	} catch (e) {
		return new Response(`not ready: ${(e as Error).message}`, { status: 503 });
	}
};
