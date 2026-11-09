import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
	const { social } = locals.svc;
	const me = locals.user!.id;
	const [results, incoming] = await Promise.all([q ? social.search(me, q) : Promise.resolve([]), social.incomingRequests(me)]);
	return { q, results, incomingCount: incoming.length };
};
