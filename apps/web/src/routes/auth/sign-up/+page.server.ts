import { fail, redirect } from '@sveltejs/kit';
import { getAuth, googleEnabled } from '#lib/server/auth.ts';
import { authErrorMessage, safeNext } from '#lib/server/auth-helpers.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	return { google: googleEnabled(), next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim().slice(0, 60);
		const email = String(f.get('email') ?? '').trim();
		const password = String(f.get('password') ?? '');
		if (!f.get('terms')) return fail(400, { name, email, error: m.auth_err_terms() });
		if (!name) return fail(400, { name, email, error: m.auth_err_name() });
		try {
			await getAuth(locals.svc).api.signUpEmail({
				body: { name, email, password, callbackURL: safeNext(url.searchParams.get('next')) },
				headers: request.headers
			});
		} catch (e) {
			return fail(400, { name, email, error: authErrorMessage(e) });
		}
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
