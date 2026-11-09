import { ORIGIN } from '$app/env/private';
import { error, fail, redirect } from '@sveltejs/kit';
import { guard } from '#lib/server/api.ts';
import { warm } from '#lib/server/og.ts';
import { listPreview } from '#lib/server/og-list.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const l = await locals.svc.readlists.bySlug(locals.user?.id ?? null, params.slug);
	if (!l) error(404, 'Not found');
	const preview = await listPreview(locals.svc, l.list);
	// Bots fetch the page first, then the image: render it now so the image request is instant.
	if (l.list.visibility !== 'private') warm(locals.svc.storage, preview.key, preview.render);
	const v = preview.v;
	return {
		...l,
		og: { url: `${ORIGIN}/l/${l.list.slug}`, image: `${ORIGIN}/og/l/${l.list.slug}.png?v=${v}` }
	};
};

export const actions: Actions = {
	save: async ({ params, locals }) => {
		if (!locals.user) redirect(303, `/auth/sign-up?next=/l/${params.slug}`);
		const l = await locals.svc.readlists.bySlug(locals.user.id, params.slug);
		if (!l) return fail(404);
		await guard(() => (l.saved ? locals.svc.readlists.unsave(locals.user!.id, l.list.id) : locals.svc.readlists.save(locals.user!.id, l.list.id)));
		return { saved: !l.saved };
	}
};
