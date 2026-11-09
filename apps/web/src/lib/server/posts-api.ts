import { InvalidPost, POST_VISIBILITIES, type PostVisibility } from '@bok/server';
import { error } from '@sveltejs/kit';

export const visibilityOf = (v: unknown): PostVisibility | undefined => (POST_VISIBILITIES.includes(v as PostVisibility) ? (v as PostVisibility) : undefined);

/** Map "too long / empty" to 400 instead of 500. */
export async function invalidAs400<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof InvalidPost) error(400, e.message);
		throw e;
	}
}
