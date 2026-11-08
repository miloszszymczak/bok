import { error } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const c = await guard(() => locals.svc.shelves.getContainer(locals.user!.id, params.id));
	const tree = await locals.svc.shelves.tree(locals.user!.id, c.householdId);
	const bookcase = tree.locations.flatMap((l) => l.containers).find((x) => x.id === c.id)!;
	return { bookcase, tree };
};
