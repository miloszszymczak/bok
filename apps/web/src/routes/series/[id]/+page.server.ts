import { error } from '@sveltejs/kit';
import { UUID } from '#lib/server/api.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const s = await locals.svc.tagging.series(locals.user?.id ?? null, params.id);
	if (!s) error(404);
	return { series: s };
};
