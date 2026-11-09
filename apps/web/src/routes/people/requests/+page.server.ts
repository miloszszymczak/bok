import { fail } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { social } = locals.svc;
	const me = locals.user!.id;
	const [incoming, outgoing] = await Promise.all([social.incomingRequests(me), social.outgoingRequests(me)]);
	return { incoming, outgoing };
};

const other = async (request: Request) => {
	const id = String((await request.formData()).get('userId') ?? '');
	return UUID.test(id) ? id : null;
};

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		const id = await other(request);
		if (!id) return fail(400);
		await guard(() => locals.svc.social.acceptFriend(locals.user!.id, id));
	},
	decline: async ({ request, locals }) => {
		const id = await other(request);
		if (!id) return fail(400);
		await guard(() => locals.svc.social.endFriendship(locals.user!.id, id));
	}
};
