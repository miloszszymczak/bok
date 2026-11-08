import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'Postgres connection string (CNPG app user).' },
	ORIGIN: { description: 'Public origin, e.g. https://bok.mwsz.org.' },
	BETTER_AUTH_SECRET: { description: 'Session signing secret, 32+ random bytes.' },
	VALKEY_URL: { schema: optional, description: 'Single-node Valkey URL, e.g. redis://valkey:6379.' },
	VALKEY_CLUSTER_NODES: { schema: optional, description: 'Comma-separated host:port list for Valkey cluster mode.' },
	VALKEY_USERNAME: { schema: optional, description: 'Valkey ACL username (omit for the default user).' },
	VALKEY_PASSWORD: { schema: optional },
	R2_ACCOUNT_ID: {},
	R2_ACCESS_KEY_ID: {},
	R2_SECRET_ACCESS_KEY: {},
	R2_BUCKET: {},
	R2_PREFIX: { schema: (v) => v ?? '' },
	R2_PUBLIC_URL: { schema: (v) => v ?? '', description: 'Custom R2 domain for media; empty = serve through /media.' },
	RESEND_API_KEY: { schema: (v) => v ?? '' },
	EMAIL_FROM: { schema: (v) => v || 'bok <noreply@bok.mwsz.org>' },
	GOOGLE_BOOKS_API_KEY: { schema: optional },
	ISBNDB_API_KEY: { schema: optional },
	GOOGLE_CLIENT_ID: { schema: optional },
	GOOGLE_CLIENT_SECRET: { schema: optional },
	ADMIN_EMAILS: { schema: (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean) },
	METRICS_TOKEN: { schema: optional, description: 'Bearer token required for /metrics when set.' }
});
