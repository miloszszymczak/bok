import { uuidv7 } from '@bok/core';
import { profiles } from '@bok/db';
import { rateLimit } from '@bok/server';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { avatarUrl } from '#lib/server/media.ts';
import type { RequestHandler } from './$types';

const MAX = 1024 * 1024;

/**
 * The browser resizes to a 512px WebP first, so bodies are small; proxying through the app
 * avoids having to open CORS on the R2 bucket.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401);
	const { kv, storage, db, accounts } = locals.svc;
	if (!(await rateLimit(kv, `avatar:${locals.user.id}`, 10, 3600))) error(429, 'Too many uploads');
	const len = Number(request.headers.get('content-length') ?? 0);
	if (len > MAX) error(413, 'Image too large');
	const buf = new Uint8Array(await request.arrayBuffer());
	const isWebp = buf.length > 12 && String.fromCharCode(...buf.slice(0, 4)) === 'RIFF' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP';
	if (!isWebp || buf.length > MAX) error(415, 'Expected a WebP image');

	const key = `avatars/${locals.user.id}/${uuidv7()}.webp`;
	await storage.put(key, buf, 'image/webp');
	const prev = await accounts.getProfile(locals.user.id);
	await db.update(profiles).set({ avatarKey: key }).where(eq(profiles.userId, locals.user.id));
	if (prev?.avatarKey) await storage.delete(prev.avatarKey).catch(() => {});
	return json({ url: avatarUrl(storage, key) });
};
