import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const inv = await locals.svc.shelves.invite(params.token);
	if (!inv) return { invite: null };
	const already = (await locals.svc.shelves.memberships(locals.user!.id)).some((m) => m.householdId === inv.householdId);
	return { invite: { name: inv.name, inviter: inv.inviter }, already };
};

export const actions: Actions = {
	default: async ({ params, locals }) => {
		const id = await locals.svc.shelves.acceptInvite(locals.user!.id, params.token);
		if (!id) error(410, 'This invite has expired or was already used.');
		redirect(303, '/library?view=shelves');
	}
};
