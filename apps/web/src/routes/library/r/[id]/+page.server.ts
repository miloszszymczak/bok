import { error, fail, redirect } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const tree = await guard(async () => {
		const loc = await locals.svc.db.query.locations.findFirst({ where: (t, { eq }) => eq(t.id, params.id) });
		if (!loc) error(404);
		return locals.svc.shelves.tree(locals.user!.id, loc.householdId);
	});
	const room = tree.locations.find((l) => l.id === params.id);
	if (!room) error(404);
	return { room };
};

export const actions: Actions = {
	rename: async ({ request, params, locals }) => {
		const name = String((await request.formData()).get('name') ?? '').trim().slice(0, 80);
		if (!name) return fail(400, { error: m.shelves_err_name() });
		await guard(() => locals.svc.shelves.renameLocation(locals.user!.id, params.id, name));
		return { renamed: true };
	},
	delete: async ({ params, locals }) => {
		await guard(() => locals.svc.shelves.deleteLocation(locals.user!.id, params.id));
		redirect(303, '/library?view=shelves');
	},
	moveBookcase: async ({ request, locals }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		if (!UUID.test(id)) return fail(400);
		await guard(() => locals.svc.shelves.moveContainer(locals.user!.id, id, f.get('dir') === 'up' ? -1 : 1));
	}
};
