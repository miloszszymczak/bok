import type { Storage } from './storage.ts';

export type CoverSize = 's' | 'm' | 'l';

/** Public URLs for stored media: mirrored cover if we have one (else the provider's URL), avatars. */
export function mediaUrls(storage: Storage) {
	return {
		cover: (key: string | null, src: string | null, size: CoverSize = 's') => (key ? storage.url(`${key}-${size}.webp`) : src),
		avatar: (key: string | null) => (key ? storage.url(key) : null)
	};
}
