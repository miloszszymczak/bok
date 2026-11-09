import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const tag = await locals.svc.tagging.bySlug(params.slug);
	if (!tag) error(404, 'Not found');
	const [page, books] = await Promise.all([
		locals.svc.posts.byTag(locals.user?.id ?? null, params.slug, url.searchParams.get('cursor')),
		locals.svc.db.execute<{ work_id: string; title: string; n: number }>(
			sql`select w.id as work_id, w.title, count(distinct t.user_id)::int as n
				from user_work_tags t join works w on w.id = t.work_id where t.tag_id = ${tag.id}
				group by w.id order by n desc, w.title limit 12`
		)
	]);
	return { tag: { slug: tag.slug, name: tag.name }, posts: page.posts, next: page.next, books: books.map((b) => ({ workId: b.work_id, title: b.title, n: b.n })) };
};
