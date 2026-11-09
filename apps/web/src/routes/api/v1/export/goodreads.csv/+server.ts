import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** GET — Goodreads-compatible CSV of my books (re-importable). */
export const GET: RequestHandler = async ({ locals }) => {
	const user = await requireUser(locals, { key: 'export', max: 10, windowSec: 600 });
	const csv = await locals.svc.exports.goodreadsCsv(user.id);
	return new Response('﻿' + csv, {
		headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="bok-goodreads-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'private, no-store' }
	});
};
