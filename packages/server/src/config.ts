/** Runtime configuration shared by web and worker. Values come from the process environment. */
export interface ServerConfig {
	databaseUrl: string;
	valkey: { url?: string; clusterNodes?: string[]; username?: string; password?: string };
	r2: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; prefix: string; publicUrl: string };
	resend: { apiKey: string; from: string };
	googleBooksApiKey?: string;
	isbndbApiKey?: string;
	origin: string;
}

const req = (env: Record<string, string | undefined>, k: string) => {
	const v = env[k];
	if (!v) throw new Error(`${k} is not set`);
	return v;
};

export function configFromEnv(env: Record<string, string | undefined> = process.env): ServerConfig {
	const nodes = env.VALKEY_CLUSTER_NODES?.split(',').map((s) => s.trim()).filter(Boolean);
	return {
		databaseUrl: req(env, 'DATABASE_URL'),
		valkey: { url: env.VALKEY_URL || undefined, clusterNodes: nodes?.length ? nodes : undefined, username: env.VALKEY_USERNAME || undefined, password: env.VALKEY_PASSWORD || undefined },
		r2: {
			accountId: req(env, 'R2_ACCOUNT_ID'),
			accessKeyId: req(env, 'R2_ACCESS_KEY_ID'),
			secretAccessKey: req(env, 'R2_SECRET_ACCESS_KEY'),
			bucket: req(env, 'R2_BUCKET'),
			prefix: env.R2_PREFIX ?? '',
			publicUrl: (env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')
		},
		resend: { apiKey: env.RESEND_API_KEY ?? '', from: env.EMAIL_FROM ?? 'bok <noreply@bok.mwsz.org>' },
		googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY || undefined,
		isbndbApiKey: env.ISBNDB_API_KEY || undefined,
		origin: req(env, 'ORIGIN')
	};
}
