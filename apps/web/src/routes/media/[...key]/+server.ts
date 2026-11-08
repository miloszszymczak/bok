import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Streams media from R2 when no public R2 domain is configured. Keys are content-addressed → immutable. */
export const GET: RequestHandler = async ({ params, locals, request }) => {
	const key = params.key;
	if (!/^(covers|avatars)\/[\w\-/.]+\.webp$/.test(key) || key.includes('..')) error(404);
	const obj = await locals.svc.storage.get(key);
	if (!obj) error(404);
	if (obj.etag && request.headers.get('if-none-match') === obj.etag) return new Response(null, { status: 304 });
	return new Response(obj.body, {
		headers: {
			'content-type': obj.contentType ?? 'image/webp',
			'cache-control': 'public, max-age=31536000, immutable',
			...(obj.etag ? { etag: obj.etag } : {}),
			...(obj.length ? { 'content-length': String(obj.length) } : {})
		}
	});
};
