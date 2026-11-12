import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import { getAuth } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';

/** POST — send the verification email again to the signed-in user's address (3 an hour). */
export const POST: RequestHandler = async ({ locals }) => {
	const user = await requireUser(locals, { key: 'verify-email', max: 3, windowSec: 3600 });
	if (user.emailVerified) return json({ ok: true, verified: true });
	await getAuth(locals.svc).api.sendVerificationEmail({ body: { email: user.email, callbackURL: '/' } });
	return json({ ok: true });
};
