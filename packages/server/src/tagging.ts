import { foldText, slugify } from '@bok/core';
import { editions, readingStates, series, tags, userWorkTags, works, workSeries, type Db } from '@bok/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Storage } from './storage.ts';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** "Tom 3", "3", "#3", "1.5" → 3 / 1.5; otherwise null. */
export function seriesPosition(raw: string | null | undefined): number | null {
	const m = raw ? /(\d+(?:[.,]\d+)?)/.exec(raw) : null;
	return m ? Number(m[1]!.replace(',', '.')) : null;
}

/** Attach a work to a series by name (creating the series). Safe to call repeatedly. */
export async function linkSeries(tx: Tx | Db, workId: string, name: string | null | undefined, position: string | null | undefined) {
	const clean = name?.trim();
	if (!clean) return;
	const folded = foldText(clean);
	const [s] = await tx
		.insert(series)
		.values({ name: clean, folded })
		.onConflictDoUpdate({ target: series.folded, set: { updatedAt: new Date() } })
		.returning({ id: series.id });
	const pos = seriesPosition(position);
	await tx
		.insert(workSeries)
		.values({ workId, seriesId: s!.id, position: pos })
		.onConflictDoUpdate({ target: [workSeries.workId, workSeries.seriesId], set: pos === null ? { workId } : { position: pos } });
}

export function createTagging(deps: { db: Db; storage: Storage }) {
	const { db, storage } = deps;
	const cover = (key: string | null, src: string | null) => (key ? storage.url(`${key}-s.webp`) : src);

	const api = {
		/** Tags I use, most used first (library/log filters). */
		async mine(userId: string) {
			return db
				.select({ slug: tags.slug, name: tags.name, count: sql<number>`count(*)::int` })
				.from(userWorkTags)
				.innerJoin(tags, eq(tags.id, userWorkTags.tagId))
				.where(eq(userWorkTags.userId, userId))
				.groupBy(tags.id)
				.orderBy(desc(sql`count(*)`), asc(tags.name));
		},

		async forWork(userId: string | null, workId: string) {
			const [mine, community] = await Promise.all([
				userId
					? db
							.select({ slug: tags.slug, name: tags.name })
							.from(userWorkTags)
							.innerJoin(tags, eq(tags.id, userWorkTags.tagId))
							.where(and(eq(userWorkTags.userId, userId), eq(userWorkTags.workId, workId)))
							.orderBy(asc(tags.name))
					: Promise.resolve([]),
				db
					.select({ slug: tags.slug, name: tags.name, count: sql<number>`count(distinct ${userWorkTags.userId})::int` })
					.from(userWorkTags)
					.innerJoin(tags, eq(tags.id, userWorkTags.tagId))
					.where(eq(userWorkTags.workId, workId))
					.groupBy(tags.id)
					.orderBy(desc(sql`count(distinct ${userWorkTags.userId})`), asc(tags.name))
					.limit(12)
			]);
			return { mine, community };
		},

		async add(userId: string, workId: string, name: string) {
			const clean = name.replace(/^#/, '').trim().slice(0, 40);
			const slug = slugify(clean, 40);
			if (!slug) return null;
			const [t] = await db
				.insert(tags)
				.values({ slug, name: clean })
				.onConflictDoUpdate({ target: tags.slug, set: { slug } })
				.returning({ id: tags.id, slug: tags.slug, name: tags.name });
			await db.insert(userWorkTags).values({ userId, workId, tagId: t!.id }).onConflictDoNothing();
			return t!;
		},

		async remove(userId: string, workId: string, slug: string) {
			const t = await db.query.tags.findFirst({ where: eq(tags.slug, slug) });
			if (!t) return;
			await db.delete(userWorkTags).where(and(eq(userWorkTags.userId, userId), eq(userWorkTags.workId, workId), eq(userWorkTags.tagId, t.id)));
		},

		async suggest(q: string) {
			const f = slugify(q, 40);
			if (!f) return [];
			return db
				.select({ slug: tags.slug, name: tags.name })
				.from(tags)
				.where(sql`${tags.slug} like ${f + '%'}`)
				.orderBy(asc(tags.slug))
				.limit(8);
		},

		async bySlug(slug: string) {
			return db.query.tags.findFirst({ where: eq(tags.slug, slug) });
		},

		/** Series this work belongs to, with all its works in order and my status for each. */
		async seriesForWork(userId: string | null, workId: string) {
			const links = await db.select({ seriesId: workSeries.seriesId }).from(workSeries).where(eq(workSeries.workId, workId));
			return Promise.all(links.map((l) => api.series(userId, l.seriesId)));
		},

		async series(userId: string | null, seriesId: string) {
			const s = await db.query.series.findFirst({ where: eq(series.id, seriesId) });
			if (!s) return null;
			const rows = await db
				.select({
					workId: works.id,
					title: works.title,
					position: workSeries.position,
					year: works.firstPublishedYear,
					coverKey: sql<string | null>`(select e.cover_key from ${editions} e where e.work_id = ${works.id} order by (e.cover_status = 'ready') desc, e.metadata_quality desc limit 1)`,
					coverSourceUrl: sql<string | null>`(select e.cover_source_url from ${editions} e where e.work_id = ${works.id} order by e.metadata_quality desc limit 1)`,
					status: userId
						? sql<string | null>`(select rs.status from ${readingStates} rs where rs.user_id = ${userId} and rs.work_id = ${works.id})`
						: sql<string | null>`null`
				})
				.from(workSeries)
				.innerJoin(works, eq(works.id, workSeries.workId))
				.where(eq(workSeries.seriesId, seriesId))
				.orderBy(sql`${workSeries.position} asc nulls last`, asc(works.firstPublishedYear), asc(works.title));
			return {
				id: s.id,
				name: s.name,
				works: rows.map(({ coverKey, coverSourceUrl, ...r }) => ({ ...r, position: r.position === null ? null : Number(r.position), cover: cover(coverKey, coverSourceUrl) }))
			};
		},

		async setSeries(workId: string, name: string | null, position: string | null) {
			await db.transaction(async (tx) => {
				await tx.delete(workSeries).where(eq(workSeries.workId, workId));
				await linkSeries(tx, workId, name, position);
			});
		}
	};
	return api;
}

export type Tagging = ReturnType<typeof createTagging>;
