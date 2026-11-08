import type { Storage } from '@bok/server';

export type CoverSize = 's' | 'm' | 'l';

/** Mirrored cover in R2 if ready, else the provider URL as a stop-gap, else null (placeholder). */
export function coverUrl(storage: Storage, e: { coverKey?: string | null; coverSourceUrl?: string | null } | null | undefined, size: CoverSize = 'm') {
	if (!e) return null;
	if (e.coverKey) return storage.url(`${e.coverKey}-${size}.webp`);
	return e.coverSourceUrl ?? null;
}

export function coverSrcset(storage: Storage, coverKey: string | null | undefined) {
	if (!coverKey) return undefined;
	return `${storage.url(`${coverKey}-s.webp`)} 120w, ${storage.url(`${coverKey}-m.webp`)} 320w, ${storage.url(`${coverKey}-l.webp`)} 640w`;
}

export const avatarUrl = (storage: Storage, key: string | null | undefined) => (key ? storage.url(key) : null);
