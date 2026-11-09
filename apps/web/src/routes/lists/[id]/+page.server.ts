import { LIST_VISIBILITIES, type ListVisibility } from '@bok/server';
import { error, fail, redirect } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!UUID.test(params.id)) error(404);
	const l = await guard(() => locals.svc.readlists.byId(locals.user!.id, params.id));
	if (!l) error(404);
	return { ...l, shareUrl: `${url.origin}/l/${l.list.slug}` };
};

export const actions: Actions = {
	settings: async ({ request, params, locals }) => {
		const f = await request.formData();
		const title = String(f.get('title') ?? '').trim();
		if (!title) return fail(400, { error: m.lists_err_title() });
		const v = String(f.get('visibility') ?? '');
		await guard(() =>
			locals.svc.readlists.update(locals.user!.id, params.id, {
				title,
				description: String(f.get('description') ?? ''),
				visibility: LIST_VISIBILITIES.includes(v as ListVisibility) ? (v as ListVisibility) : undefined
			})
		);
		return { saved: true };
	},
	delete: async ({ params, locals }) => {
		await guard(() => locals.svc.readlists.remove(locals.user!.id, params.id));
		redirect(303, '/lists');
	}
};
