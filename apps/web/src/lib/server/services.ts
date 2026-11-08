import * as env from '$app/env/private';
import { createServices, type ServerConfig, type Services } from '@bok/server';

export const config: ServerConfig = {
	databaseUrl: env.DATABASE_URL,
	valkey: {
		url: env.VALKEY_URL,
		clusterNodes: env.VALKEY_CLUSTER_NODES?.split(',').map((s) => s.trim()).filter(Boolean),
		username: env.VALKEY_USERNAME,
		password: env.VALKEY_PASSWORD
	},
	r2: {
		accountId: env.R2_ACCOUNT_ID,
		accessKeyId: env.R2_ACCESS_KEY_ID,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		bucket: env.R2_BUCKET,
		prefix: env.R2_PREFIX,
		publicUrl: env.R2_PUBLIC_URL.replace(/\/$/, '')
	},
	resend: { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM },
	googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY,
	isbndbApiKey: env.ISBNDB_API_KEY,
	origin: env.ORIGIN
};

let pending: Promise<Services> | null = null;

/** Lazily created so `vite build` (which imports server code) never connects anywhere. */
export function services(): Promise<Services> {
	pending ??= createServices(config, 'web', { adminEmails: env.ADMIN_EMAILS });
	return pending;
}
