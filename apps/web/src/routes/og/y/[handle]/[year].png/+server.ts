import { error } from '@sveltejs/kit';
import { cachedPng } from '#lib/server/og.ts';
import { yearPreview } from '#lib/server/og-year.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const year = Number(params.year);
	if (!/^\d{4}$/.test(params.year)) error(404);
	const p = await locals.svc.social.profile(null, params.handle);
	if (!p) error(404);
	const pv = await yearPreview(locals.svc, { userId: p.profile.userId, displayName: p.profile.displayName, locale: p.profile.locale }, year);
	return cachedPng(locals.svc.storage, pv.key, pv.render);
};
