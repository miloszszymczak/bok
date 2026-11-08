import { guard } from '#lib/server/api.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { shelves } = locals.svc;
	const [books, tree] = await Promise.all([shelves.unsorted(locals.user!.id), guard(() => shelves.tree(locals.user!.id))]);
	return { books, tree };
};
