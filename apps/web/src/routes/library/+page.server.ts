import { foldText } from '@bok/core';
import { copies, editions, householdMembers, works } from '@bok/db';
import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { guard, UUID } from '#lib/server/api.ts';
import { coverSrcset, coverUrl } from '#lib/server/media.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { db, storage, shelves } = locals.svc;
	const userId = locals.user!.id;
	const view = url.searchParams.get('view') === 'shelves' ? 'shelves' : 'books';
	const tree = await guard(() => shelves.tree(userId));
	if (view === 'shelves') return { view, tree, q: '', books: [], statusFilter: null, tagFilter: null, myTags: [] };

	const q = foldText(url.searchParams.get('q') ?? '');
	const statusFilter = url.searchParams.get('status');
	const tagFilter = url.searchParams.get('tag');
	const mine = db.select({ id: householdMembers.householdId }).from(householdMembers).where(eq(householdMembers.userId, userId));
	const rows = await db
		.select({
			copyId: copies.id,
			workId: works.id,
			editionId: editions.id,
			title: editions.title,
			year: editions.publishedYear,
			coverKey: editions.coverKey,
			coverSourceUrl: editions.coverSourceUrl,
			authors: sql<string[]>`coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = ${works.id}), '{}')`
		})
		.from(copies)
		.innerJoin(editions, eq(editions.id, copies.editionId))
		.innerJoin(works, eq(works.id, editions.workId))
		.where(
			sql`${copies.householdId} in ${mine}`
				.append(q ? sql` and ${works.searchText} like ${'%' + q.replace(/[%_]/g, '') + '%'}` : sql``)
				.append(
					statusFilter === 'none'
						? sql` and not exists (select 1 from reading_states rs where rs.user_id = ${userId} and rs.work_id = ${works.id})`
						: statusFilter && ['want_to_read', 'reading', 'stuck', 'read', 'dnf'].includes(statusFilter)
							? sql` and exists (select 1 from reading_states rs where rs.user_id = ${userId} and rs.work_id = ${works.id} and rs.status = ${statusFilter})`
							: sql``
				)
				.append(tagFilter ? sql` and exists (select 1 from user_work_tags t join tags g on g.id = t.tag_id where t.user_id = ${userId} and t.work_id = ${works.id} and g.slug = ${tagFilter})` : sql``)
		)
		.orderBy(desc(copies.createdAt))
		.limit(500);
	const [places, statuses, myTags] = await Promise.all([
		shelves.places(rows.map((r) => r.copyId)),
		locals.svc.reading.statuses(userId, [...new Set(rows.map((r) => r.workId))]),
		locals.svc.tagging.mine(userId)
	]);
	return {
		view,
		tree,
		q: url.searchParams.get('q') ?? '',
		statusFilter,
		tagFilter,
		myTags,
		books: rows.map((r) => {
			const p = places.get(r.copyId);
			return {
				...r,
				status: statuses.get(r.workId) ?? null,
				cover: coverUrl(storage, r, 's'),
				srcset: coverSrcset(storage, r.coverKey),
				place: p ? `${p.locationName} › ${p.containerName} › ${p.label}` : null
			};
		})
	};
};

export const actions: Actions = {
	addRoom: async ({ request, locals }) => {
		const name = String((await request.formData()).get('name') ?? '').trim().slice(0, 80);
		if (!name) return fail(400, { error: m.shelves_err_name() });
		const id = await locals.svc.shelves.createLocation(locals.user!.id, name);
		redirect(303, `/library/r/${id}`);
	},
	moveRoom: async ({ request, locals }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		if (!UUID.test(id)) return fail(400);
		await guard(() => locals.svc.shelves.moveLocation(locals.user!.id, id, f.get('dir') === 'up' ? -1 : 1));
	}
};
