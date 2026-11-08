import { runMigrations } from './migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
await runMigrations(url, process.env.MIGRATIONS_DIR || undefined);
console.log('migrations applied');
