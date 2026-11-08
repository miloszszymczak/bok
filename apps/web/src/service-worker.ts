/// <reference lib="webworker" />
import { self } from '$app/service-worker';
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

/**
 * App-shell service worker:
 * - immutable build assets + static files: cache-first (hashed names)
 * - covers/avatars under /media: cache-first with a size cap
 * - navigations: network-first, falling back to the prerendered /offline page
 * Everything else (API, auth, form actions) goes straight to the network.
 */
const SHELL = `shell-${version}`;
const MEDIA = 'media-v1';
const PAGES = 'pages-v1';
// Pages worth having offline (the app shell for scanning and browsing your library).
const OFFLINE_PAGES = ['/', '/scan', '/library'];
const MEDIA_MAX = 400;
// Manifest paths are relative to the base path ("_app/…"); request pathnames start with "/".
const PRECACHE = [...immutable.map((f) => f.path), ...assets.map((f) => f.path), ...prerendered.map((f) => f.path)].map((p) =>
	p.startsWith('/') ? p : `/${p}`
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL)
			.then((c) => c.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== MEDIA && k !== PAGES).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

async function trimMedia() {
	const c = await caches.open(MEDIA);
	const keys = await c.keys();
	for (let i = 0; i < keys.length - MEDIA_MAX; i++) await c.delete(keys[i]!);
}

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	// Hashed build output never changes: cache-first, and cache anything not precached on first
	// use (e.g. the decoder's WASM, which the manifest doesn't list) so scanning works offline.
	if (PRECACHE.includes(url.pathname) || url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(
			caches.match(req).then(
				(hit) =>
					hit ??
					fetch(req).then(async (res) => {
						if (res.ok && url.pathname.startsWith('/_app/immutable/')) await (await caches.open(SHELL)).put(req, res.clone());
						return res;
					})
			)
		);
		return;
	}

	if (url.pathname.startsWith('/media/')) {
		event.respondWith(
			caches.open(MEDIA).then(async (c) => {
				const hit = await c.match(req);
				if (hit) return hit;
				const res = await fetch(req);
				if (res.ok) {
					await c.put(req, res.clone());
					void trimMedia();
				}
				return res;
			})
		);
		return;
	}

	// Their load data (client-side rendered /scan fetches it on boot): network-first, cached copy offline.
	const dataFor = url.pathname.endsWith('/__data.json') ? url.pathname.slice(0, -'/__data.json'.length) || '/' : null;
	if (dataFor && OFFLINE_PAGES.includes(dataFor)) {
		event.respondWith(
			fetch(req)
				.then(async (res) => {
					if (res.ok) await (await caches.open(PAGES)).put(url.pathname, res.clone());
					return res;
				})
				.catch(async () => (await caches.match(url.pathname)) ?? Response.error())
		);
		return;
	}

	if (req.mode === 'navigate') {
		const cacheable = OFFLINE_PAGES.includes(url.pathname);
		event.respondWith(
			fetch(req)
				.then(async (res) => {
					if (cacheable && res.ok && res.headers.get('content-type')?.includes('text/html')) {
						const c = await caches.open(PAGES);
						await c.put(url.pathname, res.clone());
					}
					return res;
				})
				.catch(async () => (cacheable ? await caches.match(url.pathname) : undefined) ?? (await caches.match('/offline')) ?? Response.error())
		);
	}
});
