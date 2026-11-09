import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** `@` autocomplete: friends and people I follow first. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const user = await requireUser(locals, { key: 'suggest', max: 240, windowSec: 60 });
	const q = (url.searchParams.get('q') ?? '').trim();
	const { social } = locals.svc;
	// One character: filter my own circle by prefix; two or more: full people search.
	const people =
		q.length >= 2
			? await social.search(user.id, q)
			: [...(await social.friends(user.id, user.id)), ...(await social.following(user.id, user.id))].filter(
					(p, i, all) => all.findIndex((x) => x.userId === p.userId) === i && (!q || p.handle.startsWith(q.toLowerCase()) || p.displayName.toLowerCase().startsWith(q.toLowerCase()))
				);
	const ranked = people
		.filter((p) => p.userId !== user.id)
		.sort((a, b) => Number(b.friends) * 2 + Number(b.youFollow) - (Number(a.friends) * 2 + Number(a.youFollow)))
		.slice(0, 8);
	return json(ranked.map((p) => ({ handle: p.handle, displayName: p.displayName, avatar: p.avatar, friends: p.friends, youFollow: p.youFollow })));
};
