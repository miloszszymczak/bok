import { fail, redirect } from '@sveltejs/kit';
import { getAuth, googleEnabled } from '#lib/server/auth.ts';
import { authErrorMessage, safeNext } from '#lib/server/auth-helpers.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	return { google: googleEnabled(), next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	password: async ({ request, locals, url }) => {
		const f = await request.formData();
		const email = String(f.get('email') ?? '').trim();
		const password = String(f.get('password') ?? '');
		try {
			await getAuth(locals.svc).api.signInEmail({ body: { email, password, rememberMe: true }, headers: request.headers });
		} catch (e) {
			return fail(400, { mode: 'password', email, error: authErrorMessage(e) });
		}
		redirect(303, safeNext(url.searchParams.get('next')));
	},
	magic: async ({ request, locals, url }) => {
		const f = await request.formData();
		const email = String(f.get('email') ?? '').trim();
		try {
			await getAuth(locals.svc).api.signInMagicLink({
				body: { email, callbackURL: safeNext(url.searchParams.get('next')) },
				headers: request.headers
			});
		} catch (e) {
			return fail(400, { mode: 'magic', email, error: authErrorMessage(e) });
		}
		redirect(303, `/auth/check-email?kind=magic&email=${encodeURIComponent(email)}`);
	},
	google: async ({ request, locals, url }) => {
		const res = await getAuth(locals.svc).api.signInSocial({
			body: { provider: 'google', callbackURL: safeNext(url.searchParams.get('next')) },
			headers: request.headers
		});
		if (!res.url) return fail(400, { mode: 'google', email: '', error: 'Google sign-in unavailable' });
		redirect(303, res.url);
	}
};
