import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const viewerId = locals.user?.id ?? null;
	const p = await locals.svc.social.profile(viewerId, params.handle);
	if (!p || p.rel.blocked !== 'none') error(404, 'Not found');
	return { owner: { handle: p.profile.handle, displayName: p.profile.displayName }, people: await locals.svc.social.following(viewerId, p.profile.userId), kind: 'following' as const };
};
