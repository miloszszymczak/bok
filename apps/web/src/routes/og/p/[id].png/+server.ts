import { editions, works } from '@bok/db';
import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { UUID } from '#lib/server/api.ts';
import { cachedPng, imageData, ogVersion, renderPost } from '#lib/server/og.ts';
import { m } from '#lib/paraglide/messages.js';
import type { RequestHandler } from './$types';

/** Only public posts get a preview; spoilers are never shown (whole-post spoilers show a notice). */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const p = await locals.svc.posts.preview(params.id);
	if (!p) error(404);
	const { db, storage } = locals.svc;
	const w = p.firstWork ? await db.query.works.findFirst({ where: eq(works.id, p.firstWork), columns: { id: true, title: true } }) : null;
	const ed = w ? await db.query.editions.findFirst({ where: eq(editions.workId, w.id), orderBy: [desc(editions.metadataQuality)] }) : null;
	// The bundled fonts have no ⚠/▒ glyphs: spell spoilers out, in the author's language.
	const mark = m.og_spoiler_mark({}, { locale: p.locale });
	const text = p.spoiler ? m.og_post_spoiler({}, { locale: p.locale }) : (p.text ?? '').replace(/▒▒▒/g, mark);
	const v = ogVersion([text, p.name, p.handle, p.avatarKey, ed?.coverKey ?? ed?.coverSourceUrl]);
	return cachedPng(storage, `og/p/${params.id}-${v}.png`, async () =>
		renderPost({
			name: p.name,
			handle: p.handle,
			text,
			avatar: await imageData(storage, { key: p.avatarKey }, 144),
			cover: ed ? await imageData(storage, { key: ed.coverKey ? `${ed.coverKey}-m.webp` : null, src: ed.coverSourceUrl }) : null,
			coverTitle: w?.title ?? ''
		})
	);
};
