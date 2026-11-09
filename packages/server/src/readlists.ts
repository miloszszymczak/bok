import { keyBetween } from '@bok/core';
import { readlistItems, readlists, readlistSaves, works, type Db } from '@bok/db';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { Notifications } from './notifications.ts';
import type { Storage } from './storage.ts';
import { Forbidden, NotFound } from './shelves.ts';

export type ListVisibility = 'private' | 'unlisted' | 'public';
export const LIST_VISIBILITIES: ListVisibility[] = ['private', 'unlisted', 'public'];

const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const newSlug = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('');

export interface ListItem {
	id: string;
	workId: string;
	editionId: string | null;
	position: string;
	note: string;
	title: string;
	authors: string[];
	year: number | null;
	cover: string | null;
	coverKey: string | null;
}

export function createReadlists(deps: { db: Db; storage: Storage; notifications: Notifications }) {
	const { db, storage, notifications } = deps;
	const cover = (key: string | null, src: string | null, size: 's' | 'm' = 's') => (key ? storage.url(`${key}-${size}.webp`) : src);

	async function owned(userId: string, listId: string) {
		const l = await db.query.readlists.findFirst({ where: eq(readlists.id, listId) });
		if (!l) throw new NotFound();
		if (l.ownerId !== userId) throw new Forbidden();
		return l;
	}

	const touch = (listId: string) => db.update(readlists).set({ updatedAt: new Date() }).where(eq(readlists.id, listId));

	/** List summaries with item counts and up to 4 covers (for cards and the OG collage). */
	async function summaries(where: ReturnType<typeof sql>, order = sql`l.updated_at desc`) {
		const rows = await db.execute<{ id: string; slug: string; title: string; description: string; visibility: ListVisibility; owner_id: string; owner_handle: string; owner_name: string; updated_at: Date; count: number; covers: { key: string | null; src: string | null; title: string }[] | null }>(sql`
			select l.id, l.slug, l.title, l.description, l.visibility, l.owner_id, p.handle as owner_handle, p.display_name as owner_name, l.updated_at,
				(select count(*)::int from readlist_items i where i.readlist_id = l.id) as count,
				(select json_agg(c) from (
					select e.cover_key as key, e.cover_source_url as src, w.title
					from readlist_items i join works w on w.id = i.work_id
					left join lateral (select cover_key, cover_source_url from editions where id = coalesce(i.edition_id, (select id from editions where work_id = w.id order by (cover_status = 'ready') desc, metadata_quality desc limit 1))) e on true
					where i.readlist_id = l.id order by i.position limit 4) c) as covers
			from readlists l join profiles p on p.user_id = l.owner_id
			where ${where}
			order by ${order}
			limit 200`);
		return rows.map((r) => ({
			id: r.id,
			slug: r.slug,
			title: r.title,
			description: r.description,
			visibility: r.visibility,
			ownerId: r.owner_id,
			ownerHandle: r.owner_handle,
			ownerName: r.owner_name,
			updatedAt: new Date(r.updated_at).toISOString(),
			count: r.count,
			covers: (r.covers ?? []).map((c) => ({ title: c.title, url: cover(c.key, c.src, 'm'), key: c.key, src: c.src }))
		}));
	}

	const api = {
		async create(ownerId: string, input: { title: string; description?: string; visibility?: ListVisibility }) {
			const [l] = await db
				.insert(readlists)
				.values({ ownerId, title: input.title.trim().slice(0, 120), description: (input.description ?? '').trim().slice(0, 2000), visibility: input.visibility ?? 'private', slug: newSlug() })
				.returning();
			return l!;
		},

		async update(ownerId: string, listId: string, input: { title?: string; description?: string; visibility?: ListVisibility }) {
			await owned(ownerId, listId);
			await db
				.update(readlists)
				.set({
					...(input.title !== undefined ? { title: input.title.trim().slice(0, 120) } : {}),
					...(input.description !== undefined ? { description: input.description.trim().slice(0, 2000) } : {}),
					...(input.visibility ? { visibility: input.visibility } : {})
				})
				.where(eq(readlists.id, listId));
		},

		async remove(ownerId: string, listId: string) {
			await owned(ownerId, listId);
			await db.delete(readlists).where(eq(readlists.id, listId));
		},

		/** Append a book (no-op if it's already on the list). */
		async addItem(ownerId: string, listId: string, workId: string, editionId?: string | null, note = '') {
			await owned(ownerId, listId);
			const [last] = await db.select({ p: readlistItems.position }).from(readlistItems).where(eq(readlistItems.readlistId, listId)).orderBy(desc(readlistItems.position)).limit(1);
			const [row] = await db
				.insert(readlistItems)
				.values({ readlistId: listId, workId, editionId: editionId ?? null, position: keyBetween(last?.p ?? null, null), note: note.slice(0, 1000) })
				.onConflictDoNothing()
				.returning({ id: readlistItems.id });
			await touch(listId);
			return row?.id ?? null;
		},

		async removeItem(ownerId: string, listId: string, itemId: string) {
			await owned(ownerId, listId);
			await db.delete(readlistItems).where(and(eq(readlistItems.id, itemId), eq(readlistItems.readlistId, listId)));
			await touch(listId);
		},

		async removeWork(ownerId: string, listId: string, workId: string) {
			await owned(ownerId, listId);
			await db.delete(readlistItems).where(and(eq(readlistItems.workId, workId), eq(readlistItems.readlistId, listId)));
			await touch(listId);
		},

		async setNote(ownerId: string, listId: string, itemId: string, note: string) {
			await owned(ownerId, listId);
			await db.update(readlistItems).set({ note: note.trim().slice(0, 1000) }).where(and(eq(readlistItems.id, itemId), eq(readlistItems.readlistId, listId)));
		},

		/**
		 * Move an item to sit right after `afterId` (null = to the top). Only the moved row
		 * changes: its key is computed between its new neighbours.
		 */
		async move(ownerId: string, listId: string, itemId: string, afterId: string | null) {
			await owned(ownerId, listId);
			let before: string | null = null;
			if (afterId) {
				const a = await db.query.readlistItems.findFirst({ where: and(eq(readlistItems.id, afterId), eq(readlistItems.readlistId, listId)) });
				if (!a) throw new NotFound();
				before = a.position;
			}
			const [next] = await db
				.select({ p: readlistItems.position })
				.from(readlistItems)
				.where(and(eq(readlistItems.readlistId, listId), before ? gt(readlistItems.position, before) : sql`true`, sql`${readlistItems.id} <> ${itemId}`))
				.orderBy(asc(readlistItems.position))
				.limit(1);
			const position = keyBetween(before, next?.p ?? null);
			await db.update(readlistItems).set({ position }).where(and(eq(readlistItems.id, itemId), eq(readlistItems.readlistId, listId)));
			await touch(listId);
			return position;
		},

		/**
		 * A list as `viewerId` may see it: private → owner only; unlisted/public → anyone with
		 * the slug, unless the owner and viewer have blocked each other.
		 */
		async bySlug(viewerId: string | null, slug: string) {
			const l = await db.query.readlists.findFirst({ where: eq(readlists.slug, slug) });
			if (!l) return null;
			const isOwner = viewerId === l.ownerId;
			if (!isOwner) {
				if (l.visibility === 'private' || l.hiddenAt) return null;
				const [r] = await db.execute<{ ok: boolean }>(sql`
					select not exists (select 1 from blocks b where (b.blocker_id = ${l.ownerId} and b.blocked_id = ${viewerId}) or (b.blocker_id = ${viewerId} and b.blocked_id = ${l.ownerId}))
						and exists (select 1 from profiles p where p.user_id = ${l.ownerId} and p.hidden_at is null and p.suspended_at is null and p.deletion_requested_at is null) as ok`);
				if (!r?.ok) return null;
			}
			const [summary] = await summaries(sql`l.id = ${l.id}`);
			const saved = viewerId && !isOwner ? !!(await db.query.readlistSaves.findFirst({ where: and(eq(readlistSaves.userId, viewerId), eq(readlistSaves.readlistId, l.id)) })) : false;
			const [saves] = await db.select({ n: sql<number>`count(*)::int` }).from(readlistSaves).where(eq(readlistSaves.readlistId, l.id));
			return { list: summary!, isOwner, saved, saves: saves?.n ?? 0, items: await api.items(l.id) };
		},

		async byId(ownerId: string, listId: string) {
			const l = await owned(ownerId, listId);
			return api.bySlug(ownerId, l.slug);
		},

		async items(listId: string): Promise<ListItem[]> {
			const rows = await db
				.select({
					id: readlistItems.id,
					workId: readlistItems.workId,
					editionId: readlistItems.editionId,
					position: readlistItems.position,
					note: readlistItems.note,
					title: works.title,
					year: works.firstPublishedYear,
					authors: sql<string[]>`coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = ${works.id}), '{}')`,
					coverKey: sql<string | null>`(select e.cover_key from editions e where e.id = coalesce(${readlistItems.editionId}, (select id from editions where work_id = ${works.id} order by (cover_status = 'ready') desc, metadata_quality desc limit 1)))`,
					coverSourceUrl: sql<string | null>`(select e.cover_source_url from editions e where e.id = coalesce(${readlistItems.editionId}, (select id from editions where work_id = ${works.id} order by metadata_quality desc limit 1)))`
				})
				.from(readlistItems)
				.innerJoin(works, eq(works.id, readlistItems.workId))
				.where(eq(readlistItems.readlistId, listId))
				.orderBy(asc(readlistItems.position));
			return rows.map(({ coverSourceUrl, ...r }) => ({ ...r, cover: cover(r.coverKey, coverSourceUrl, 'm') }));
		},

		mine: (userId: string) => summaries(sql`l.owner_id = ${userId}`),
		saved: (userId: string) =>
			summaries(
				sql`exists (select 1 from readlist_saves s where s.user_id = ${userId} and s.readlist_id = l.id) and l.visibility <> 'private' and l.hidden_at is null and p.hidden_at is null and p.suspended_at is null`,
				sql`(select created_at from readlist_saves s where s.user_id = ${userId} and s.readlist_id = l.id) desc`
			),
		/** Shown on a profile: public lists (all lists for the owner themself). */
		onProfile: (ownerId: string, viewerId: string | null) =>
			summaries(viewerId === ownerId ? sql`l.owner_id = ${ownerId}` : sql`l.owner_id = ${ownerId} and l.visibility = 'public' and l.hidden_at is null`),

		/** For the "Add to list…" sheet: my lists and whether this work is on each. */
		async forWork(userId: string, workId: string) {
			const rows = await db.execute<{ id: string; title: string; visibility: ListVisibility; count: number; has: boolean }>(sql`
				select l.id, l.title, l.visibility,
					(select count(*)::int from readlist_items i where i.readlist_id = l.id) as count,
					exists (select 1 from readlist_items i where i.readlist_id = l.id and i.work_id = ${workId}) as has
				from readlists l where l.owner_id = ${userId} order by l.updated_at desc`);
			return rows.map((r) => ({ ...r }));
		},

		async save(userId: string, listId: string) {
			const l = await db.query.readlists.findFirst({ where: eq(readlists.id, listId) });
			if (!l || l.visibility === 'private' || l.ownerId === userId) throw new Forbidden();
			const r = await db.insert(readlistSaves).values({ userId, readlistId: listId }).onConflictDoNothing().returning();
			if (r.length) await notifications.notify(l.ownerId, 'readlist_saved', { actorId: userId, data: { url: `/l/${l.slug}`, title: l.title }, dedupeKey: `save:${userId}:${listId}` });
		},

		async unsave(userId: string, listId: string) {
			await db.delete(readlistSaves).where(and(eq(readlistSaves.userId, userId), eq(readlistSaves.readlistId, listId)));
		}
	};
	return api;
}

export type Readlists = ReturnType<typeof createReadlists>;
