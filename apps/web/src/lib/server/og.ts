import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import type { Storage } from '@bok/server';
import satori from 'satori';
import sharp from 'sharp';

/**
 * Link-preview images (1200×630 PNG) rendered with satori → resvg, cached in R2 under a
 * content hash; page meta tags point at ?v=<hash>, so a changed list gets a new image URL.
 */
export const OG_W = 1200;
export const OG_H = 630;

export { ogVersion } from './og-version.ts';

const require = createRequire(import.meta.url);
let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[] | null = null;
function loadFonts() {
	if (fonts) return fonts;
	const f = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));
	fonts = [
		{ name: 'Serif', data: f('@fontsource/noto-serif', 'noto-serif-latin-700-normal.woff'), weight: 700, style: 'normal' },
		{ name: 'SerifExt', data: f('@fontsource/noto-serif', 'noto-serif-latin-ext-700-normal.woff'), weight: 700, style: 'normal' },
		{ name: 'Sans', data: f('@fontsource/noto-sans', 'noto-sans-latin-400-normal.woff'), weight: 400, style: 'normal' },
		{ name: 'SansExt', data: f('@fontsource/noto-sans', 'noto-sans-latin-ext-400-normal.woff'), weight: 400, style: 'normal' },
		{ name: 'Sans', data: f('@fontsource/noto-sans', 'noto-sans-latin-600-normal.woff'), weight: 600, style: 'normal' },
		{ name: 'SansExt', data: f('@fontsource/noto-sans', 'noto-sans-latin-ext-600-normal.woff'), weight: 600, style: 'normal' }
	];
	return fonts;
}

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({
	type,
	props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children }
});
const img = (src: string, style: Record<string, unknown>): Node => ({ type: 'img', props: { src, style } });

/** Satori only falls back between differently named fonts: latin + latin-ext (ą ę ł ń ś ź ż). */
const SERIF = 'Serif, SerifExt';
const SANS = 'Sans, SansExt';

const C = { bg: '#f6f1e9', ink: '#1f1b16', muted: '#6b6257', accent: '#2f5d50', paper: '#fffdf9' };

/** Cover/avatar → small JPEG data URI (R2 key or URL). Null when unavailable. */
export async function imageData(storage: Storage, ref: { key?: string | null; src?: string | null }, width = 260): Promise<string | null> {
	try {
		let buf: Buffer | null = null;
		if (ref.key) {
			const obj = await storage.get(ref.key);
			if (obj) buf = Buffer.from(await new Response(obj.body).arrayBuffer());
		}
		if (!buf && ref.src) {
			const res = await fetch(ref.src, { signal: AbortSignal.timeout(3000), headers: { 'user-agent': 'bok/0.1 (+https://bok.mwsz.org)' } });
			if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) buf = Buffer.from(await res.arrayBuffer());
		}
		if (!buf) return null;
		const out = await sharp(buf).resize({ width, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer();
		return `data:image/jpeg;base64,${out.toString('base64')}`;
	} catch {
		return null;
	}
}

function placeholder(title: string, w: number, hgt: number) {
	const hue = [...title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
	return h('div', { width: w, height: hgt, borderRadius: 10, padding: 16, backgroundImage: `linear-gradient(160deg, hsl(${hue} 35% 38%), hsl(${(hue + 40) % 360} 40% 24%))`, color: '#fff', fontFamily: SERIF, fontSize: Math.round(w / 8), lineHeight: 1.15, overflow: 'hidden' }, title.slice(0, 60));
}

function cover(data: string | null, title: string, w: number) {
	const hgt = Math.round(w * 1.5);
	return data ? img(data, { width: w, height: hgt, objectFit: 'cover', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.25)' }) : placeholder(title, w, hgt);
}

const brand = () => h('div', { alignItems: 'center', gap: 14 }, h('div', { width: 44, height: 44, borderRadius: 12, backgroundColor: C.accent }), h('div', { fontFamily: SERIF, fontSize: 40, color: C.ink }, 'bok'));

function frame(left: Node, right: Node) {
	return h('div', { width: OG_W, height: OG_H, backgroundColor: C.bg, padding: 64, gap: 56, alignItems: 'center' }, left, right);
}

async function toPng(node: Node) {
	const svg = await satori(node as never, { width: OG_W, height: OG_H, fonts: loadFonts() });
	return new Resvg(svg, { fitTo: { mode: 'width', value: OG_W } }).render().asPng();
}

export async function renderList(o: { title: string; owner: string; countLabel: string; covers: { data: string | null; title: string }[] }) {
	const cs = o.covers.slice(0, 4);
	const stack = h(
		'div',
		{ width: 430, height: 480, position: 'relative' },
		// Drawn back to front so the list's first book ends up on top.
		...(cs.length ? cs : [{ data: null, title: o.title }])
			.map((c, i) => h('div', { position: 'absolute', left: i * 72, top: i * 26, transform: `rotate(${(i - 1.5) * 3}deg)` }, cover(c.data, c.title, 220)))
			.reverse()
	);
	const text = h(
		'div',
		{ flexDirection: 'column', flex: 1, gap: 18 },
		brand(),
		h('div', { fontFamily: SERIF, fontSize: o.title.length > 40 ? 54 : 66, lineHeight: 1.1, color: C.ink, marginTop: 24 }, o.title.slice(0, 90)),
		h('div', { fontFamily: SANS, fontSize: 30, color: C.muted }, `${o.owner} · ${o.countLabel}`)
	);
	return toPng(frame(stack, text));
}

export async function renderBook(o: { title: string; authors: string; cover: string | null; meta: string }) {
	const text = h(
		'div',
		{ flexDirection: 'column', flex: 1, gap: 18 },
		brand(),
		h('div', { fontFamily: SERIF, fontSize: o.title.length > 40 ? 56 : 70, lineHeight: 1.1, color: C.ink, marginTop: 24 }, o.title.slice(0, 90)),
		h('div', { fontFamily: SANS, fontWeight: 600, fontSize: 34, color: C.ink }, o.authors.slice(0, 80)),
		h('div', { fontFamily: SANS, fontSize: 26, color: C.muted }, o.meta)
	);
	return toPng(frame(h('div', { width: 320 }, cover(o.cover, o.title, 320)), text));
}

export async function renderProfile(o: { name: string; handle: string; avatar: string | null; stats: string }) {
	const avatar = o.avatar
		? img(o.avatar, { width: 300, height: 300, borderRadius: 150, objectFit: 'cover' })
		: h('div', { width: 300, height: 300, borderRadius: 150, backgroundColor: '#dfe9e4', color: C.accent, fontFamily: SERIF, fontSize: 140, alignItems: 'center', justifyContent: 'center' }, o.name.slice(0, 1).toUpperCase());
	const text = h(
		'div',
		{ flexDirection: 'column', flex: 1, gap: 16 },
		brand(),
		h('div', { fontFamily: SERIF, fontSize: 72, lineHeight: 1.1, color: C.ink, marginTop: 24 }, o.name.slice(0, 50)),
		h('div', { fontFamily: SANS, fontSize: 32, color: C.muted }, `@${o.handle}`),
		h('div', { fontFamily: SANS, fontWeight: 600, fontSize: 30, color: C.accent }, o.stats)
	);
	return toPng(frame(avatar, text));
}

export async function renderYear(o: { name: string; title: string; line: string; covers: { data: string | null; title: string }[] }) {
	const cs = o.covers.slice(0, 5);
	const fan = h(
		'div',
		{ width: 470, height: 480, position: 'relative' },
		...(cs.length ? cs : [{ data: null, title: o.title }])
			.map((c, i) => h('div', { position: 'absolute', left: i * 62, top: 40 + Math.abs(i - 2) * 14, transform: `rotate(${(i - 2) * 5}deg)` }, cover(c.data, c.title, 200)))
			.reverse()
	);
	const text = h(
		'div',
		{ flexDirection: 'column', flex: 1, gap: 16 },
		brand(),
		h('div', { fontFamily: SANS, fontSize: 30, color: C.muted, marginTop: 24 }, o.name.slice(0, 50)),
		h('div', { fontFamily: SERIF, fontSize: 68, lineHeight: 1.05, color: C.ink }, o.title),
		h('div', { fontFamily: SANS, fontWeight: 600, fontSize: 34, color: C.accent }, o.line)
	);
	return toPng(frame(fan, text));
}

const inflight = new Map<string, Promise<Buffer>>();

export async function renderPost(o: { name: string; handle: string; avatar: string | null; text: string; cover: string | null; coverTitle: string }) {
	const avatarNode = o.avatar
		? img(o.avatar, { width: 72, height: 72, borderRadius: 36, objectFit: 'cover' })
		: h('div', { width: 72, height: 72, borderRadius: 36, backgroundColor: '#dfe9e4', color: C.accent, fontFamily: SERIF, fontSize: 36, alignItems: 'center', justifyContent: 'center' }, o.name.slice(0, 1).toUpperCase());
	const excerpt = o.text.length > 240 ? `${o.text.slice(0, 237)}…` : o.text;
	const text = h(
		'div',
		{ flexDirection: 'column', flex: 1, gap: 22 },
		h('div', { alignItems: 'center', gap: 18 }, avatarNode, h('div', { flexDirection: 'column' }, h('div', { fontFamily: SANS, fontWeight: 600, fontSize: 32, color: C.ink }, o.name.slice(0, 40)), h('div', { fontFamily: SANS, fontSize: 24, color: C.muted }, `@${o.handle} · bok`))),
		h('div', { fontFamily: SERIF, fontSize: excerpt.length > 140 ? 34 : 44, lineHeight: 1.3, color: C.ink }, excerpt)
	);
	return toPng(frame(text, o.cover || o.coverTitle ? h('div', { width: 260 }, cover(o.cover, o.coverTitle, 260)) : h('div', { width: 0 })));
}

/** Render + store once per key (concurrent requests share the work). */
async function ensure(storage: Storage, key: string, render: () => Promise<Buffer | Uint8Array>) {
	let p = inflight.get(key);
	if (!p) {
		p = render().then(async (png) => {
			const buf = Buffer.from(png);
			await storage.put(key, buf, 'image/png').catch(() => {});
			return buf;
		});
		inflight.set(key, p);
		p.finally(() => inflight.delete(key)).catch(() => {});
	}
	return p;
}

/** Pre-render in the background (e.g. when the page is fetched, before a bot asks for the image). */
export function warm(storage: Storage, key: string, render: () => Promise<Buffer | Uint8Array>) {
	void storage
		.get(key)
		.then(async (hit) => {
			if (hit) await hit.body.cancel();
			else await ensure(storage, key, render);
		})
		.catch(() => {});
}

/** Serve from R2 if this version exists, else render, store and serve. */
export async function cachedPng(storage: Storage, key: string, render: () => Promise<Buffer | Uint8Array>) {
	const headers = { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' };
	const hit = await storage.get(key).catch(() => null);
	if (hit) return new Response(hit.body, { headers });
	const png = await ensure(storage, key, render);
	return new Response(new Uint8Array(png), { headers: { ...headers, 'content-length': String(png.length) } });
}
