import { fail, redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth.ts';
import { authErrorMessage } from '#lib/server/auth-helpers.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	token: url.searchParams.get('token') ?? '',
	invalid: url.searchParams.get('error') === 'INVALID_TOKEN'
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const f = await request.formData();
		const token = String(f.get('token') ?? '');
		const newPassword = String(f.get('password') ?? '');
		try {
			await getAuth(locals.svc).api.resetPassword({ body: { token, newPassword }, headers: request.headers });
		} catch (e) {
			return fail(400, { error: authErrorMessage(e) });
		}
		redirect(303, '/auth/sign-in?reset=1');
	}
};
