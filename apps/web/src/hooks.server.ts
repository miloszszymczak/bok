import { building } from '$app/env';
import { redirect } from '@sveltejs/kit';
import { type Handle, sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { getAuth } from '#lib/server/auth.ts';
import { services } from '#lib/server/services.ts';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
						.replace('%theme%', event.locals.theme === 'system' ? '' : `data-theme="${event.locals.theme}"`)
			}
		)
	);

const PUBLIC_PREFIXES = ['/auth', '/api/auth', '/privacy', '/terms', '/offline', '/media', '/healthz', '/readyz', '/metrics', '/book', '/u/'];

const handleSession: Handle = async ({ event, resolve }) => {
	const theme = event.cookies.get('theme');
	event.locals.theme = theme === 'light' || theme === 'dark' ? theme : 'system';
	if (building) return resolve(event);

	const svc = await services();
	event.locals.svc = svc;
	const path = event.url.pathname;
	// Probes and media never need a session lookup.
	if (path.startsWith('/healthz') || path.startsWith('/readyz') || path.startsWith('/media/') || path === '/metrics') return resolve(event);

	const auth = getAuth(svc);
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		const u = session.user;
		event.locals.user = { id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified };
		event.locals.sessionToken = session.session.token;
	}

	const isPublic = path === '/' || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
	if (!isPublic && !event.locals.user) {
		if (path.startsWith('/api/')) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
		redirect(303, `/auth/sign-in?next=${encodeURIComponent(path + event.url.search)}`);
	}
	return svelteKitHandler({ event, resolve, auth, building });
};

const handleHeaders: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	res.headers.set('x-content-type-options', 'nosniff');
	res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	res.headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=()');
	return res;
};

// Paraglide first so every later step (including better-auth endpoints and email callbacks) knows the locale.
export const handle: Handle = sequence(handleHeaders, handleParaglide, handleSession);
