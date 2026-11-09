import { editions, works } from '@bok/db';
import { error } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { UUID } from '#lib/server/api.ts';
import { cachedPng, imageData, ogVersion, renderBook } from '#lib/server/og.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!UUID.test(params.id)) error(404);
	const { db, storage } = locals.svc;
	const w = await db.query.works.findFirst({ where: eq(works.id, params.id) });
	if (!w) error(404);
	const eid = url.searchParams.get('e');
	const ed =
		(eid && UUID.test(eid) ? await db.query.editions.findFirst({ where: eq(editions.id, eid) }) : undefined) ??
		(await db.query.editions.findFirst({ where: eq(editions.workId, w.id), orderBy: [desc(editions.metadataQuality)] }));
	const authors = await db.execute<{ name: string }>(sql`select a.name from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = ${w.id} order by wa.position`);
	const names = authors.map((a) => a.name).join(', ');
	const meta = [ed?.publisher, ed?.publishedYear ?? w.firstPublishedYear].filter(Boolean).join(' · ');
	const v = ogVersion([w.title, names, ed?.coverKey ?? ed?.coverSourceUrl, meta]);
	return cachedPng(storage, `og/book/${w.id}-${ed?.id ?? 'x'}-${v}.png`, async () =>
		renderBook({ title: ed?.title ?? w.title, authors: names, meta, cover: await imageData(storage, { key: ed?.coverKey ? `${ed.coverKey}-l.webp` : null, src: ed?.coverSourceUrl }, 400) })
	);
};
