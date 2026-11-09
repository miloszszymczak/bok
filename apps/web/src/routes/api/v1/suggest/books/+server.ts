import { foldText, parseIdentifier } from '@bok/core';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { requireUser } from '#lib/server/api.ts';
import { coverUrl } from '#lib/server/media.ts';
import type { RequestHandler } from './$types';

/** `$` autocomplete: my books first, then the catalogue; an ISBN is looked up directly. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const user = await requireUser(locals, { key: 'suggest', max: 240, windowSec: 60 });
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
	const { db, catalog, storage } = locals.svc;
	if (parseIdentifier(q)) {
		const r = await catalog.lookup(q, { userId: user.id });
		if (r.status !== 'found') return json([]);
		const [w] = await db.execute<{ title: string; cover_key: string | null; cover_source_url: string | null; authors: string[] }>(sql`
			select w.title, e.cover_key, e.cover_source_url, coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = w.id), '{}') as authors
			from works w join editions e on e.id = ${r.editionId} where w.id = ${r.workId}`);
		return json([{ workId: r.workId, editionId: r.editionId, title: w!.title, authors: w!.authors, cover: coverUrl(storage, { coverKey: w!.cover_key, coverSourceUrl: w!.cover_source_url }, 's'), mine: false }]);
	}
	const f = foldText(q);
	if (f.length < 2) return json([]);
	const mine = await db.execute<{ id: string; title: string; authors: string[]; cover_key: string | null; cover_source_url: string | null }>(sql`
		select w.id, w.title, e.cover_key, e.cover_source_url,
			coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = w.id), '{}') as authors
		from works w
		left join lateral (select cover_key, cover_source_url from editions where work_id = w.id order by (cover_status = 'ready') desc, metadata_quality desc limit 1) e on true
		where w.search_text like ${'%' + f.replace(/[%_]/g, '') + '%'}
			and (exists (select 1 from reading_states rs where rs.user_id = ${user.id} and rs.work_id = w.id)
				or exists (select 1 from copies c join editions e2 on e2.id = c.edition_id join household_members hm on hm.household_id = c.household_id where hm.user_id = ${user.id} and e2.work_id = w.id))
		limit 5`);
	const rest = (await catalog.search(q, 8)).filter((r) => !mine.some((m) => m.id === r.id)).slice(0, 8 - mine.length);
	return json([
		...mine.map((r) => ({ workId: r.id, editionId: null, title: r.title, authors: r.authors, cover: coverUrl(storage, { coverKey: r.cover_key, coverSourceUrl: r.cover_source_url }, 's'), mine: true })),
		...rest.map((r) => ({ workId: r.id, editionId: null, title: r.title, authors: r.authors ?? [], cover: coverUrl(storage, { coverKey: r.cover_key, coverSourceUrl: r.cover_source_url }, 's'), mine: false }))
	]);
};
