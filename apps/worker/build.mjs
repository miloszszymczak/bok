import { build } from 'esbuild';

await build({
	entryPoints: { index: 'src/index.ts', migrate: '../../packages/db/src/migrate-cli.ts' },
	outdir: 'dist',
	bundle: true,
	platform: 'node',
	target: 'node24',
	format: 'esm',
	sourcemap: true,
	// Native / dynamically-required modules stay in node_modules.
	external: ['sharp', 'pg-native'],
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
	logLevel: 'info'
});
