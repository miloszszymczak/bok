import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/**
 * GET ?code= — which of my shelves carries this label, or { sectionId: null }. Not a 404: any
 * non-book barcode is asked about, and a miss is a normal answer (no console noise).
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const user = await requireUser(locals, { key: 'shelf-code-find', max: 240, windowSec: 60 });
	const id = await locals.svc.shelves.findByCode(user.id, url.searchParams.get('code') ?? '');
	return json({ sectionId: id }, { headers: { 'cache-control': 'private, no-store' } });
};
