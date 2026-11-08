import { editions, works } from '@bok/db';
import { rateLimit } from '@bok/server';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { coverUrl } from '#lib/server/media.ts';
import type { RequestHandler } from './$types';

/** JSON lookup used by the scanner: GET /api/v1/lookup?code=9788375780635 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401);
	const { catalog, kv, db, storage } = locals.svc;
	if (!(await rateLimit(kv, `lookup:${locals.user.id}`, 120, 60))) error(429, 'Too many lookups');
	const r = await catalog.lookup(url.searchParams.get('code') ?? '', { userId: locals.user.id });
	if (r.status !== 'found') return json({ status: r.status }, { status: r.status === 'invalid' ? 400 : 404 });
	const e = await db.query.editions.findFirst({ where: eq(editions.id, r.editionId) });
	const w = await db.query.works.findFirst({ where: eq(works.id, r.workId), columns: { id: true, title: true } });
	return json({
		status: 'found',
		source: r.source,
		work: w,
		edition: e && { id: e.id, title: e.title, isbn13: e.isbn13, publisher: e.publisher, year: e.publishedYear, cover: coverUrl(storage, e, 's') }
	});
};
