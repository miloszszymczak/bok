import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/schema/index.ts',
	out: './migrations',
	dialect: 'postgresql',
	casing: 'snake_case',
	strict: true
});
