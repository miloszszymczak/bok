import { parseIdentifier } from '@bok/core';
import { searchOpenLibrary } from '@bok/metadata';
import { redirect } from '@sveltejs/kit';
import { coverSrcset, coverUrl } from '#lib/server/media.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
	if (!q) return { q, local: [], remote: Promise.resolve([]) };
	if (parseIdentifier(q)) redirect(303, `/isbn/${encodeURIComponent(q)}`);

	const { catalog, storage, shelves } = locals.svc;
	const hits = await catalog.search(q, 20);
	const mine = locals.user ? await shelves.copiesOfWorks(locals.user.id, hits.map((h) => h.id)) : [];
	const where = new Map<string, string>();
	for (const c of mine) if (!where.has(c.workId)) where.set(c.workId, c.place ? `${c.place.containerName} ${c.place.label}` : '');
	const local = hits.map((r) => ({
		owned: where.has(r.id),
		where: where.get(r.id) ?? null,
		id: r.id,
		title: r.title,
		authors: r.authors ?? [],
		year: r.first_published_year,
		cover: coverUrl(storage, { coverKey: r.cover_key, coverSourceUrl: r.cover_source_url }, 's'),
		srcset: coverSrcset(storage, r.cover_key)
	}));
	// Streamed: the page renders local hits immediately, Open Library fills in after.
	const remote = searchOpenLibrary(q, { limit: 10 }).catch(() => []);
	return { q, local, remote };
};
