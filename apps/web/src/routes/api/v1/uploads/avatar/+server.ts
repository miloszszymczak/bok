import { uuidv7 } from '@bok/core';
import { profiles } from '@bok/db';
import { isWebp } from '@bok/server';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requireUser } from '#lib/server/api.ts';
import { avatarUrl } from '#lib/server/media.ts';
import type { RequestHandler } from './$types';

const MAX = 1024 * 1024;

/**
 * The browser resizes to a 512px WebP first, so bodies are small; proxying through the app
 * avoids having to open CORS on the R2 bucket.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'avatar', max: 10, windowSec: 3600 });
	const { storage, db, accounts } = locals.svc;
	if (Number(request.headers.get('content-length') ?? 0) > MAX) error(413, 'Image too large');
	const buf = new Uint8Array(await request.arrayBuffer());
	if (buf.length > MAX) error(413, 'Image too large');
	if (!isWebp(buf)) error(415, 'Expected a WebP image');

	const key = `avatars/${user.id}/${uuidv7()}.webp`;
	await storage.put(key, buf, 'image/webp');
	const prev = await accounts.getProfile(user.id);
	await db.update(profiles).set({ avatarKey: key }).where(eq(profiles.userId, user.id));
	if (prev?.avatarKey) await storage.delete(prev.avatarKey).catch(() => {});
	return json({ url: avatarUrl(storage, key) });
};
