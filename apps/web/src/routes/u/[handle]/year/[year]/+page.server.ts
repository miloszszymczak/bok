import { error } from '@sveltejs/kit';
import { ORIGIN } from '$app/env/private';
import { warm } from '#lib/server/og.ts';
import { yearPreview } from '#lib/server/og-year.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!/^\d{4}$/.test(params.year)) error(404);
	const year = Number(params.year);
	const viewerId = locals.user?.id ?? null;
	const p = await locals.svc.social.profile(viewerId, params.handle);
	if (!p || p.rel.blocked !== 'none') error(404, 'Not found');
	const owner = p.profile.userId;
	const [stats, goal, pv] = await Promise.all([
		locals.svc.reading.fullStats(owner, viewerId, year),
		p.rel.self ? locals.svc.reading.goal(owner, year) : Promise.resolve(null),
		yearPreview(locals.svc, { userId: owner, displayName: p.profile.displayName, locale: p.profile.locale }, year)
	]);
	if (pv.books) warm(locals.svc.storage, pv.key, pv.render);
	return {
		year,
		person: { handle: p.profile.handle, displayName: p.profile.displayName, isMe: p.rel.self },
		stats,
		goal,
		og: { url: `${ORIGIN}/u/${p.profile.handle}/year/${year}`, image: `${ORIGIN}/og/y/${p.profile.handle}/${year}.png?v=${pv.v}` }
	};
};
