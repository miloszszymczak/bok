import { error } from '@sveltejs/kit';
import { cachedPng, imageData, ogVersion, renderProfile } from '#lib/server/og.ts';
import { m } from '#lib/paraglide/messages.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const p = await locals.svc.social.profile(null, params.handle);
	if (!p) error(404);
	const stats = await locals.svc.reading.stats(p.profile.userId, null, new Date().getUTCFullYear());
	const line = m.og_profile_stats({ read: stats.total, followers: p.counts.followers });
	const v = ogVersion([p.profile.displayName, p.profile.handle, p.profile.avatarKey, line]);
	return cachedPng(locals.svc.storage, `og/u/${p.profile.userId}-${v}.png`, async () =>
		renderProfile({ name: p.profile.displayName, handle: p.profile.handle, stats: line, avatar: await imageData(locals.svc.storage, { key: p.profile.avatarKey }, 300) })
	);
};
