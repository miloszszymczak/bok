import { LIST_VISIBILITIES, type ListVisibility } from '@bok/server';
import { fail, redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [mine, saved] = await Promise.all([locals.svc.readlists.mine(locals.user!.id), locals.svc.readlists.saved(locals.user!.id)]);
	return { mine, saved };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const f = await request.formData();
		const title = String(f.get('title') ?? '').trim();
		if (!title) return fail(400, { error: m.lists_err_title() });
		const v = String(f.get('visibility') ?? 'private');
		const l = await locals.svc.readlists.create(locals.user!.id, { title, visibility: LIST_VISIBILITIES.includes(v as ListVisibility) ? (v as ListVisibility) : 'private' });
		redirect(303, `/lists/${l.id}`);
	}
};
