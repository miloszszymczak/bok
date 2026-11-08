import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.ts';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(url: string, opts: { max?: number; applicationName?: string } = {}) {
	const client = postgres(url, {
		max: opts.max ?? 10,
		idle_timeout: 30,
		connection: { application_name: opts.applicationName ?? 'bok' }
	});
	return { db: drizzle(client, { schema, casing: 'snake_case' }), client };
}
