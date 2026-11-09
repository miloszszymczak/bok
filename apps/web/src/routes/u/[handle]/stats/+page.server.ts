import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const viewerId = locals.user?.id ?? null;
	const p = await locals.svc.social.profile(viewerId, params.handle);
	if (!p || p.rel.blocked !== 'none') error(404, 'Not found');
	const y = url.searchParams.get('year');
	const year = y && /^\d{4}$/.test(y) ? Number(y) : null;
	const stats = await locals.svc.reading.fullStats(p.profile.userId, viewerId, year);
	return { person: { handle: p.profile.handle, displayName: p.profile.displayName, isMe: p.rel.self }, stats, year };
};
