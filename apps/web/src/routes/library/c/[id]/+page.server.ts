import { error, fail, redirect } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const c = await guard(() => locals.svc.shelves.getContainer(locals.user!.id, params.id));
	const tree = await locals.svc.shelves.tree(locals.user!.id, c.householdId);
	const room = tree.locations.find((l) => l.id === c.locationId)!;
	return { room: { id: room.id, name: room.name }, bookcase: room.containers.find((x) => x.id === c.id)! };
};

export const actions: Actions = {
	rename: async ({ request, params, locals }) => {
		const name = String((await request.formData()).get('name') ?? '').trim().slice(0, 80);
		if (!name) return fail(400, { error: m.shelves_err_name() });
		await guard(() => locals.svc.shelves.renameContainer(locals.user!.id, params.id, name));
		return { renamed: true };
	},
	delete: async ({ params, locals }) => {
		const c = await guard(() => locals.svc.shelves.getContainer(locals.user!.id, params.id));
		await locals.svc.shelves.deleteContainer(locals.user!.id, params.id);
		redirect(303, `/library/r/${c.locationId}`);
	}
};
