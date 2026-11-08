import { copies, editions, householdMembers, works } from '@bok/db';
import { desc, eq, sql } from 'drizzle-orm';
import { coverSrcset, coverUrl } from '#lib/server/media.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { recent: [], total: 0, inProgress: [], goal: null };
	const { db, storage } = locals.svc;
	const mine = db.select({ id: householdMembers.householdId }).from(householdMembers).where(eq(householdMembers.userId, locals.user.id));
	const [rows, [count]] = await Promise.all([
		db
			.select({
				workId: works.id,
				title: editions.title,
				coverKey: editions.coverKey,
				coverSourceUrl: editions.coverSourceUrl,
				authors: sql<string[]>`coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = ${works.id}), '{}')`
			})
			.from(copies)
			.innerJoin(editions, eq(editions.id, copies.editionId))
			.innerJoin(works, eq(works.id, editions.workId))
			.where(sql`${copies.householdId} in ${mine}`)
			.orderBy(desc(copies.createdAt))
			.limit(12),
		db.select({ n: sql<number>`count(*)::int` }).from(copies).where(sql`${copies.householdId} in ${mine}`)
	]);
	const { reading } = locals.svc;
	const year = new Date().getUTCFullYear();
	const [inProgress, target, done] = await Promise.all([reading.inProgress(locals.user.id), reading.goal(locals.user.id, year), reading.finishedInYear(locals.user.id, year)]);
	return {
		inProgress: inProgress.map((r) => ({ ...r, lastActivityAt: r.lastActivityAt.toISOString() })),
		goal: target ? { year, target, done } : null,
		total: count?.n ?? 0,
		recent: rows.map((r) => ({ ...r, cover: coverUrl(storage, r, 'm'), srcset: coverSrcset(storage, r.coverKey) }))
	};
};
