import { fail, redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const email = String((await request.formData()).get('email') ?? '').trim();
		if (!email) return fail(400, { email });
		// Always answer the same way so the form can't be used to probe for accounts.
		await getAuth(locals.svc)
			.api.requestPasswordReset({ body: { email, redirectTo: '/auth/reset' }, headers: request.headers })
			.catch(() => {});
		redirect(303, `/auth/check-email?kind=reset&email=${encodeURIComponent(email)}`);
	}
};
