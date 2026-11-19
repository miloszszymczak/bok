import { error, fail, redirect } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const { shelves } = locals.svc;
	const detail = await guard(() => shelves.section(locals.user!.id, params.id));
	const [tree, last] = await Promise.all([shelves.tree(locals.user!.id, detail.section.householdId), shelves.lastInventory(params.id)]);
	return {
		...detail,
		tree,
		lastInventory: last ? { at: last.finishedAt.toISOString(), confirmed: last.result.confirmed.length, missing: last.result.missing.length, misplaced: last.result.misplaced.length, unknown: last.result.unknown.length } : null
	};
};

export const actions: Actions = {
	rename: async ({ request, params, locals }) => {
		const label = String((await request.formData()).get('label') ?? '').trim().slice(0, 20);
		await guard(() => locals.svc.shelves.renameSection(locals.user!.id, params.id, label || null));
		return { renamed: true };
	},
	/** Single compartments are named by their container (pile, box, e-reader). */
	renameContainer: async ({ request, params, locals }) => {
		const name = String((await request.formData()).get('name') ?? '').trim().slice(0, 80);
		if (!name) return fail(400, { error: true });
		const d = await guard(() => locals.svc.shelves.section(locals.user!.id, params.id));
		await locals.svc.shelves.renameContainer(locals.user!.id, d.container.id, name);
		return { renamed: true };
	},
	deleteContainer: async ({ params, locals }) => {
		const d = await guard(() => locals.svc.shelves.section(locals.user!.id, params.id));
		await locals.svc.shelves.deleteContainer(locals.user!.id, d.container.id);
		redirect(303, `/library/r/${d.place.locationId}`);
	},
	removeCode: async ({ params, locals }) => {
		await guard(() => locals.svc.shelves.setSectionCode(locals.user!.id, params.id, null));
		return { codeRemoved: true };
	},
};
