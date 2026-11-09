import { avatarUrl } from '#lib/server/media.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const theme = locals.theme;
	if (!locals.user) return { user: null, profile: null, theme, unread: 0, vapidKey: null };
	const p = await locals.svc.accounts.getProfile(locals.user.id);
	// New device: adopt the language saved on the profile from the next request on.
	if (p && !cookies.get('PARAGLIDE_LOCALE')) {
		cookies.set('PARAGLIDE_LOCALE', p.locale, { path: '/', maxAge: 60 * 60 * 24 * 400, httpOnly: false, sameSite: 'lax' });
	}
	const unread = await locals.svc.notifications.unread(locals.user.id);
	return {
		theme,
		unread,
		vapidKey: locals.svc.notifications.publicKey,
		user: { id: locals.user.id, email: locals.user.email, emailVerified: locals.user.emailVerified },
		profile: p
			? {
					handle: p.handle,
					displayName: p.displayName,
					avatarUrl: avatarUrl(locals.svc.storage, p.avatarKey),
					isAdmin: locals.svc.accounts.isAdmin(locals.user.email, p.role),
					deletionRequestedAt: p.deletionRequestedAt?.toISOString() ?? null
				}
			: null
	};
};
