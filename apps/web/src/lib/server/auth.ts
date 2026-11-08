import * as env from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { uuidv7 } from '@bok/core';
import { account, session, user, verification } from '@bok/db';
import { actionEmail, log, type Services } from '@bok/server';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { m } from '#lib/paraglide/messages.js';

function build(svc: Services) {
	const { kv, mailer, accounts } = svc;
	const send = (to: string, kind: 'verify' | 'reset' | 'magic', url: string) => {
		const t = {
			verify: { subject: m.email_verify_subject(), heading: m.email_verify_heading(), body: m.email_verify_body(), cta: m.email_verify_cta() },
			reset: { subject: m.email_reset_subject(), heading: m.email_reset_heading(), body: m.email_reset_body(), cta: m.email_reset_cta() },
			magic: { subject: m.email_magic_subject(), heading: m.email_magic_heading(), body: m.email_magic_body(), cta: m.email_magic_cta() }
		}[kind];
		// Don't block the response on the email provider.
		void mailer.send(actionEmail({ to, url, footer: m.email_footer(), ...t })).catch((e) => log.error({ err: e, kind }, 'email failed'));
	};

	return betterAuth({
		baseURL: env.ORIGIN,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(svc.db, { provider: 'pg', schema: { user, session, account, verification } }),
		// Sessions + rate-limit counters live in Valkey; Postgres stays the source of truth for users.
		secondaryStorage: {
			get: (key) => kv.get(`auth:${key}`),
			getAndDelete: (key) => kv.getdel(`auth:${key}`),
			increment: async (key, ttl) => {
				const n = await kv.incr(`auth:${key}`);
				if (n === 1) await kv.expire(`auth:${key}`, ttl);
				return n;
			},
			set: async (key, value, ttl) => {
				if (ttl) await kv.set(`auth:${key}`, value, 'EX', ttl);
				else await kv.set(`auth:${key}`, value);
			},
			delete: async (key) => {
				await kv.del(`auth:${key}`);
			}
		},
		session: { storeSessionInDatabase: true, expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
		rateLimit: { enabled: true, storage: 'secondary-storage', window: 60, max: 30 },
		advanced: { database: { generateId: () => uuidv7() } },
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 10,
			sendResetPassword: async ({ user, url }) => send(user.email, 'reset', url)
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => send(user.email, 'verify', url)
		},
		socialProviders:
			env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
				? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
				: {},
		databaseHooks: {
			user: {
				create: {
					after: async (u) => {
						let locale = 'en';
						try {
							locale = getLocale();
						} catch {
							/* outside a request (should not happen) */
						}
						await accounts.bootstrap({ id: u.id, name: u.name, email: u.email }, locale);
					}
				}
			}
		},
		plugins: [
			magicLink({ sendMagicLink: async ({ email, url }) => send(email, 'magic', url), expiresIn: 15 * 60 }),
			sveltekitCookies(getRequestEvent) // must stay last
		]
	});
}

export type Auth = ReturnType<typeof build>;
let instance: Auth | null = null;
export const getAuth = (svc: Services) => (instance ??= build(svc));
export const googleEnabled = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
