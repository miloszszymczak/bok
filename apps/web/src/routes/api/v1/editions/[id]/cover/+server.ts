import { isWebp } from '@bok/server';
import { error, json } from '@sveltejs/kit';
import { guard, requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

const LIMITS = { s: 64 * 1024, m: 256 * 1024, l: 768 * 1024 } as const;

/** multipart: s, m, l — WebP variants (120/320/640px wide) produced on the device. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'cover', max: 30, windowSec: 3600 });
	const form = await request.formData();
	const set = {} as Record<'s' | 'm' | 'l', Uint8Array>;
	for (const size of ['s', 'm', 'l'] as const) {
		const f = form.get(size);
		if (!(f instanceof File) || f.size > LIMITS[size]) error(400, `Missing or oversized "${size}" image`);
		const buf = new Uint8Array(await f.arrayBuffer());
		if (!isWebp(buf)) error(415, 'Expected WebP images');
		set[size] = buf;
	}
	const res = await guard(() => locals.svc.editor.setCover(params.id, set, user.id));
	if (!res) error(404, 'Edition not found');
	return json({ ok: true, cover: locals.svc.storage.url(`${res.coverKey}-m.webp`) });
};
