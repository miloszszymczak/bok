import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

/**
 * Fetching images from URLs we didn't choose (cover links in provider metadata). Plain fetch()
 * would follow redirects anywhere, including our own cluster. Here: http(s) on default ports only,
 * no credentials, every hop's address resolved and checked at connect time (so DNS rebinding
 * can't swap it afterwards), at most 3 redirects, and the body is cut off at `maxBytes`.
 */
export class UnsafeUrl extends Error {}

const V4_BLOCKED: [number, number][] = [
	[0x00000000, 8], // "this" network
	[0x0a000000, 8], // 10/8
	[0x64400000, 10], // 100.64/10 carrier-grade NAT
	[0x7f000000, 8], // loopback
	[0xa9fe0000, 16], // link-local (cloud metadata)
	[0xac100000, 12], // 172.16/12
	[0xc0000000, 24], // 192.0.0/24
	[0xc0000200, 24], // TEST-NET-1
	[0xc0a80000, 16], // 192.168/16
	[0xc6120000, 15], // 198.18/15 benchmarking
	[0xc6336400, 24], // TEST-NET-2
	[0xcb007100, 24], // TEST-NET-3
	[0xe0000000, 4], // multicast
	[0xf0000000, 4] // reserved + broadcast
];

function v4ToInt(ip: string) {
	return ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved… anything not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) {
		const n = v4ToInt(ip);
		return V4_BLOCKED.some(([base, bits]) => (n & (bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0)) >>> 0 === base);
	}
	if (kind === 6) {
		const a = ip.toLowerCase();
		const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a) ?? /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(a);
		if (mapped) return isPrivateAddress(mapped[1]!);
		if (a === '::' || a === '::1') return true;
		const first = parseInt(a.split(':')[0] || '0', 16);
		return (first & 0xfe00) === 0xfc00 /* fc00::/7 unique local */ || (first & 0xffc0) === 0xfe80 /* fe80::/10 link-local */ || (first & 0xff00) === 0xff00 /* multicast */;
	}
	return true;
}

/** DNS lookup that refuses private addresses — used by the socket itself, so no TOCTOU. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
	dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
		if (err) return callback(err, '', 0);
		const list = addresses as LookupAddress[];
		const bad = list.find((a) => isPrivateAddress(a.address));
		if (!list.length || bad) return callback(new UnsafeUrl(`blocked address for ${hostname}`), '', 0);
		if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
		callback(null, list[0]!.address, list[0]!.family);
	});
};

export function checkUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new UnsafeUrl('not a URL');
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new UnsafeUrl('scheme');
	if (url.username || url.password) throw new UnsafeUrl('credentials');
	if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) throw new UnsafeUrl('port');
	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrl('private address');
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) throw new UnsafeUrl('internal host');
	return url;
}

export interface SafeImageOptions {
	maxBytes: number;
	timeoutMs?: number;
	userAgent?: string;
	maxRedirects?: number;
}

/** GET an image; null when it isn't one, is too big, or the server says no. Throws UnsafeUrl for blocked targets. */
export async function fetchImageSafely(raw: string, o: SafeImageOptions): Promise<Buffer | null> {
	const deadline = AbortSignal.timeout(o.timeoutMs ?? 10_000);
	let url = checkUrl(raw);
	for (let hop = 0; ; hop++) {
		const res = await get(url, o, deadline);
		if (res.redirect) {
			if (hop >= (o.maxRedirects ?? 3)) return null;
			url = checkUrl(new URL(res.redirect, url).href);
			continue;
		}
		return res.body;
	}
}

function get(url: URL, o: SafeImageOptions, signal: AbortSignal): Promise<{ redirect?: string; body: Buffer | null }> {
	const lib = url.protocol === 'https:' ? https : http;
	return new Promise((resolve, reject) => {
		const req = lib.get(url, { lookup: guardedLookup, signal, headers: { 'user-agent': o.userAgent ?? 'bok/0.1', accept: 'image/*' } }, (res) => {
			const status = res.statusCode ?? 0;
			if (status >= 300 && status < 400 && res.headers.location) {
				res.resume();
				return resolve({ redirect: res.headers.location, body: null });
			}
			const type = res.headers['content-type'] ?? '';
			const declared = Number(res.headers['content-length'] ?? 0);
			if (status !== 200 || !type.startsWith('image/') || declared > o.maxBytes) {
				res.resume();
				return resolve({ body: null });
			}
			const chunks: Buffer[] = [];
			let size = 0;
			res.on('data', (c: Buffer) => {
				size += c.length;
				if (size > o.maxBytes) {
					res.destroy();
					resolve({ body: null });
				} else chunks.push(c);
			});
			res.on('end', () => resolve({ body: size > 0 ? Buffer.concat(chunks) : null }));
			res.on('error', reject);
		});
		req.on('error', reject);
	});
}
