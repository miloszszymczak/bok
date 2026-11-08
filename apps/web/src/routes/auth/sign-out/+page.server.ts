import { redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/settings');

export const actions: Actions = {
	default: async ({ request, locals }) => {
		await getAuth(locals.svc).api.signOut({ headers: request.headers }).catch(() => {});
		redirect(303, '/');
	}
};
