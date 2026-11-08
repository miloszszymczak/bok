import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';

const LOCK_ID = 727_001; // arbitrary, constant per app

/**
 * Applies pending migrations under a session advisory lock, so several pods
 * (init containers) starting together never run migrations concurrently.
 */
export async function runMigrations(url: string, migrationsFolder?: string) {
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		await sql`select pg_advisory_lock(${LOCK_ID})`;
		await migrate(drizzle(sql), {
			migrationsFolder: migrationsFolder ?? fileURLToPath(new URL('../migrations', import.meta.url))
		});
	} finally {
		await sql`select pg_advisory_unlock(${LOCK_ID})`.catch(() => {});
		await sql.end();
	}
}
