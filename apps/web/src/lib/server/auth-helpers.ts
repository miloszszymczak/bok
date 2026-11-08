import { isAPIError } from 'better-auth/api';
import { m } from '#lib/paraglide/messages.js';

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined, fallback = '/') {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

export function authErrorMessage(e: unknown): string {
	if (isAPIError(e)) {
		const code = (e.body as { code?: string } | undefined)?.code ?? '';
		if (code === 'INVALID_EMAIL_OR_PASSWORD') return m.auth_err_invalid();
		if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') return m.auth_err_exists();
		if (code === 'PASSWORD_TOO_SHORT') return m.auth_err_password_short();
		if (code === 'INVALID_TOKEN') return m.auth_err_token();
		if (e.status === 'TOO_MANY_REQUESTS' || e.statusCode === 429) return m.auth_err_rate();
		return e.message || m.error_generic();
	}
	return m.error_generic();
}
