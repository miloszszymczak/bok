import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

// Image hosts covers may be served from before they are mirrored to R2.
const coverHosts: `https://${string}.${string}`[] = ['https://covers.openlibrary.org', 'https://archive.org', 'https://*.archive.org', 'https://books.google.com', 'https://*.googleusercontent.com', 'https://images.isbndb.com'];

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter({ precompress: true }),
			env: { dir: '../..' },
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'img-src': ['self', 'data:', 'blob:', ...coverHosts, ...(process.env.R2_PUBLIC_URL ? [process.env.R2_PUBLIC_URL as `https://${string}.${string}`] : [])],
					'connect-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					// Svelte SSR adds onload/onerror="this.__e=event" to <img> so early events survive hydration.
					'script-src': ['self', 'unsafe-hashes', 'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I='],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'form-action': ['self', 'https://accounts.google.com']
				}
			},
			version: { name: process.env.BOK_VERSION ?? 'dev' }
		}),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
			cookieMaxAge: 60 * 60 * 24 * 400,
			// Same layout as the CLI compile in `npm run check`, so running both never deletes the other's files.
			outputStructure: 'locale-modules'
		})
	],
	server: { fs: { allow: ['../..'] } },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: { name: 'server', environment: 'node', include: ['src/**/*.{test,spec}.{js,ts}'] }
			}
		]
	}
});
