import { error } from '@sveltejs/kit';
import { cachedPng } from '#lib/server/og.ts';
import { listPreview } from '#lib/server/og-list.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	// Crawlers are anonymous: only unlisted/public lists get a preview.
	const l = await locals.svc.readlists.bySlug(null, params.slug);
	if (!l) error(404);
	const p = await listPreview(locals.svc, l.list);
	return cachedPng(locals.svc.storage, p.key, p.render);
};
