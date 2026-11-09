import { extractRefs, parsePost, POST_MAX, toPlain, visibleLength, type PostNode } from '@bok/core';
import { comments, likes, postBookRefs, postMentions, posts, postTags, profiles, tags, works, type Db } from '@bok/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Notifications } from './notifications.ts';
import type { Storage } from './storage.ts';
import { Forbidden, NotFound } from './shelves.ts';

export type PostVisibility = 'public' | 'followers' | 'friends' | 'private';
export const POST_VISIBILITIES: PostVisibility[] = ['public', 'followers', 'friends', 'private'];
export const COMMENT_MAX = 1000;

export class InvalidPost extends Error {}

export interface Author {
	userId: string;
	handle: string;
	displayName: string;
	avatar: string | null;
}

export interface PostView {
	id: string;
	author: Author;
	body: string;
	nodes: PostNode[];
	visibility: PostVisibility;
	spoiler: boolean;
	createdAt: string;
	editedAt: string | null;
	likes: number;
	liked: boolean;
	comments: number;
	books: Record<string, { title: string; cover: string | null }>;
	isMine: boolean;
}

export interface CommentView {
	id: string;
	author: Author;
	nodes: PostNode[];
	spoiler: boolean;
	createdAt: string;
	editedAt: string | null;
	likes: number;
	liked: boolean;
	canDelete: boolean;
}

export type FeedItem =
	| { kind: 'post'; at: string; key: string; post: PostView }
	| {
			kind: 'read';
			at: string;
			key: string;
			id: string;
			actor: Author;
			outcome: 'finished';
			book: { workId: string; title: string; authors: string[]; cover: string | null };
			rating: number | null;
			review: string;
			reviewSpoiler: boolean;
	  }
	| { kind: 'list'; at: string; key: string; id: string; actor: Author; title: string; slug: string; count: number; covers: (string | null)[] };

/** Opaque keyset cursor: "<iso time>|<id>". */
const encodeCursor = (at: string, id: string) => Buffer.from(`${at}|${id}`).toString('base64url');
function decodeCursor(c: string | null | undefined): { at: string; id: string } | null {
	if (!c) return null;
	const [at, id] = Buffer.from(c, 'base64url').toString().split('|');
	return at && id && !Number.isNaN(Date.parse(at)) ? { at, id } : null;
}

export function createPosts(deps: { db: Db; storage: Storage; notifications: Notifications }) {
	const { db, storage, notifications } = deps;
	const avatar = (k: string | null) => (k ? storage.url(k) : null);
	const cover = (key: string | null, src: string | null) => (key ? storage.url(`${key}-s.webp`) : src);

	/** May `viewer` see this post? (author visibility rules + moderation + blocks). */
	const visiblePost = (viewer: string | null) =>
		sql`p.hidden_at is null and can_view(${viewer}, p.author_id, p.visibility)
			and exists (select 1 from profiles ap where ap.user_id = p.author_id and ap.hidden_at is null and ap.suspended_at is null and ap.deletion_requested_at is null)`;

	function validate(body: string) {
		const trimmed = body.replace(/\r\n/g, '\n').trim();
		if (!trimmed) throw new InvalidPost('empty');
		if (visibleLength(trimmed) > POST_MAX) throw new InvalidPost('too long');
		return trimmed;
	}

	/** Store refs for a post; returns user ids newly mentioned (for notifications). */
	async function writeRefs(postId: string, authorId: string, body: string) {
		const refs = extractRefs(body);
		const before = await db.select({ userId: postMentions.userId }).from(postMentions).where(eq(postMentions.postId, postId));
		await db.delete(postBookRefs).where(eq(postBookRefs.postId, postId));
		await db.delete(postMentions).where(eq(postMentions.postId, postId));
		await db.delete(postTags).where(eq(postTags.postId, postId));
		if (refs.books.length) {
			const known = await db.select({ id: works.id }).from(works).where(inArray(works.id, refs.books.map((b) => b.workId)));
			const ok = new Set(known.map((k) => k.id));
			const rows = refs.books.filter((b) => ok.has(b.workId)).map((b) => ({ postId, workId: b.workId, editionId: b.editionId }));
			if (rows.length) await db.insert(postBookRefs).values(rows).onConflictDoNothing();
		}
		let mentioned: string[] = [];
		if (refs.mentions.length) {
			const people = await db
				.select({ userId: profiles.userId })
				.from(profiles)
				.where(and(inArray(sql`lower(${profiles.handle})`, refs.mentions), sql`${profiles.userId} <> ${authorId}`, sql`${profiles.hiddenAt} is null`));
			mentioned = people.map((p) => p.userId);
			if (mentioned.length) await db.insert(postMentions).values(mentioned.map((userId) => ({ postId, userId }))).onConflictDoNothing();
		}
		for (const t of refs.tags) {
			const [tag] = await db.insert(tags).values({ slug: t.slug, name: t.name }).onConflictDoUpdate({ target: tags.slug, set: { slug: t.slug } }).returning({ id: tags.id });
			await db.insert(postTags).values({ postId, tagId: tag!.id }).onConflictDoNothing();
		}
		const had = new Set(before.map((b) => b.userId));
		return mentioned.filter((u) => !had.has(u));
	}

	/** Mentions only reach people who can actually see the post. */
	async function notifyMentions(postId: string, authorId: string, userIds: string[]) {
		for (const u of userIds) {
			const [ok] = await db.execute<{ ok: boolean }>(sql`select can_view(${u}, author_id, visibility) as ok from posts where id = ${postId}`);
			if (ok?.ok) await notifications.notify(u, 'mention', { actorId: authorId, data: { url: `/p/${postId}` }, dedupeKey: `mention:${postId}:${u}` });
		}
	}

	async function hydrate(viewer: string | null, ids: string[]): Promise<PostView[]> {
		if (!ids.length) return [];
		const rows = await db.execute<{
			id: string; author_id: string; body: string; visibility: PostVisibility; spoiler: boolean; created_at: Date; edited_at: Date | null;
			handle: string; display_name: string; avatar_key: string | null; likes: number; liked: boolean; comments: number;
		}>(sql`
			select p.id, p.author_id, p.body, p.visibility, p.spoiler, p.created_at, p.edited_at, a.handle, a.display_name, a.avatar_key,
				(select count(*)::int from likes l where l.target_type = 'post' and l.target_id = p.id) as likes,
				${viewer ? sql`exists (select 1 from likes l where l.target_type = 'post' and l.target_id = p.id and l.user_id = ${viewer})` : sql`false`} as liked,
				(select count(*)::int from comments c where c.post_id = p.id and c.hidden_at is null) as comments
			from posts p join profiles a on a.user_id = p.author_id
			where p.id in ${ids}`);
		const refs = await db.execute<{ post_id: string; work_id: string; title: string; cover_key: string | null; cover_source_url: string | null }>(sql`
			select r.post_id, r.work_id, w.title, e.cover_key, e.cover_source_url
			from post_book_refs r join works w on w.id = r.work_id
			left join lateral (select cover_key, cover_source_url from editions where id = coalesce(r.edition_id, (select id from editions where work_id = w.id order by (cover_status = 'ready') desc, metadata_quality desc limit 1))) e on true
			where r.post_id in ${ids}`);
		const byId = new Map(rows.map((r) => [r.id, r]));
		return ids
			.map((id) => byId.get(id))
			.filter((r): r is NonNullable<typeof r> => !!r)
			.map((r) => ({
				id: r.id,
				author: { userId: r.author_id, handle: r.handle, displayName: r.display_name, avatar: avatar(r.avatar_key) },
				body: r.body,
				nodes: parsePost(r.body),
				visibility: r.visibility,
				spoiler: r.spoiler,
				createdAt: new Date(r.created_at).toISOString(),
				editedAt: r.edited_at ? new Date(r.edited_at).toISOString() : null,
				likes: r.likes,
				liked: r.liked,
				comments: r.comments,
				books: Object.fromEntries(refs.filter((b) => b.post_id === r.id).map((b) => [b.work_id, { title: b.title, cover: cover(b.cover_key, b.cover_source_url) }])),
				isMine: viewer === r.author_id
			}));
	}

	async function page(viewer: string | null, where: ReturnType<typeof sql>, cursor?: string | null, limit = 20) {
		const c = decodeCursor(cursor);
		const rows = await db.execute<{ id: string; created_at: Date }>(sql`
			select p.id, p.created_at from posts p
			where ${visiblePost(viewer)} and ${where}
				${c ? sql`and (p.created_at, p.id::text) < (${c.at}::timestamptz, ${c.id})` : sql``}
			order by p.created_at desc, p.id desc limit ${limit + 1}`);
		const more = rows.length > limit;
		const pageRows = rows.slice(0, limit);
		const last = pageRows.at(-1);
		return { posts: await hydrate(viewer, pageRows.map((r) => r.id)), next: more && last ? encodeCursor(new Date(last.created_at).toISOString(), last.id) : null };
	}

	async function ownPost(userId: string, postId: string) {
		const p = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
		if (!p) throw new NotFound();
		if (p.authorId !== userId) throw new Forbidden();
		return p;
	}

	async function canSee(viewer: string | null, postId: string) {
		const [r] = await db.execute<{ ok: boolean }>(sql`select ${visiblePost(viewer)} as ok from posts p where p.id = ${postId}`);
		return !!r?.ok;
	}

	const api = {
		async create(authorId: string, input: { body: string; visibility?: PostVisibility; spoiler?: boolean }) {
			const body = validate(input.body);
			const [p] = await db
				.insert(posts)
				.values({ authorId, body, visibility: input.visibility ?? 'public', spoiler: !!input.spoiler })
				.returning({ id: posts.id });
			const mentioned = await writeRefs(p!.id, authorId, body);
			await notifyMentions(p!.id, authorId, mentioned);
			return p!.id;
		},

		async update(authorId: string, postId: string, input: { body: string; visibility?: PostVisibility; spoiler?: boolean }) {
			await ownPost(authorId, postId);
			const body = validate(input.body);
			await db
				.update(posts)
				.set({ body, editedAt: new Date(), ...(input.visibility ? { visibility: input.visibility } : {}), ...(input.spoiler !== undefined ? { spoiler: input.spoiler } : {}) })
				.where(eq(posts.id, postId));
			const mentioned = await writeRefs(postId, authorId, body);
			await notifyMentions(postId, authorId, mentioned);
		},

		async remove(userId: string, postId: string) {
			await ownPost(userId, postId);
			// likes has no foreign key (post or comment): clear them with the post.
			await db.transaction(async (tx) => {
				await tx.execute(sql`delete from likes where (target_type = 'post' and target_id = ${postId}) or (target_type = 'comment' and target_id in (select id from comments where post_id = ${postId}))`);
				await tx.delete(posts).where(eq(posts.id, postId));
			});
		},

		async get(viewer: string | null, postId: string) {
			if (!(await canSee(viewer, postId))) return null;
			return (await hydrate(viewer, [postId]))[0] ?? null;
		},

		canSee,
		hydrate,

		byAuthor: (viewer: string | null, authorId: string, cursor?: string | null) => page(viewer, sql`p.author_id = ${authorId}`, cursor),
		aboutWork: (viewer: string | null, workId: string, cursor?: string | null) =>
			page(viewer, sql`exists (select 1 from post_book_refs r where r.post_id = p.id and r.work_id = ${workId})`, cursor),
		byTag: (viewer: string | null, slug: string, cursor?: string | null) =>
			page(viewer, sql`exists (select 1 from post_tags pt join tags t on t.id = pt.tag_id where pt.post_id = p.id and t.slug = ${slug})`, cursor),

		// ── Likes ──
		async like(userId: string, targetType: 'post' | 'comment', targetId: string) {
			const postId = targetType === 'post' ? targetId : (await db.query.comments.findFirst({ where: eq(comments.id, targetId), columns: { postId: true } }))?.postId;
			if (!postId || !(await canSee(userId, postId))) throw new NotFound();
			const r = await db.insert(likes).values({ userId, targetType, targetId }).onConflictDoNothing().returning();
			if (r.length) {
				const owner =
					targetType === 'post'
						? (await db.query.posts.findFirst({ where: eq(posts.id, targetId), columns: { authorId: true } }))?.authorId
						: (await db.query.comments.findFirst({ where: eq(comments.id, targetId), columns: { authorId: true } }))?.authorId;
				if (owner) await notifications.notify(owner, 'like', { actorId: userId, data: { url: `/p/${postId}` }, dedupeKey: `like:${targetType}:${targetId}:${userId}` });
			}
		},

		async unlike(userId: string, targetType: 'post' | 'comment', targetId: string) {
			await db.delete(likes).where(and(eq(likes.userId, userId), eq(likes.targetType, targetType), eq(likes.targetId, targetId)));
		},

		// ── Comments ──
		async comments(viewer: string | null, postId: string): Promise<CommentView[]> {
			if (!(await canSee(viewer, postId))) return [];
			const post = await db.query.posts.findFirst({ where: eq(posts.id, postId), columns: { authorId: true } });
			const rows = await db.execute<{ id: string; author_id: string; body: string; spoiler: boolean; created_at: Date; edited_at: Date | null; handle: string; display_name: string; avatar_key: string | null; likes: number; liked: boolean }>(sql`
				select c.id, c.author_id, c.body, c.spoiler, c.created_at, c.edited_at, a.handle, a.display_name, a.avatar_key,
					(select count(*)::int from likes l where l.target_type = 'comment' and l.target_id = c.id) as likes,
					${viewer ? sql`exists (select 1 from likes l where l.target_type = 'comment' and l.target_id = c.id and l.user_id = ${viewer})` : sql`false`} as liked
				from comments c join profiles a on a.user_id = c.author_id
				where c.post_id = ${postId} and c.hidden_at is null and a.hidden_at is null and a.suspended_at is null
					${viewer ? sql`and not exists (select 1 from blocks b where (b.blocker_id = ${viewer} and b.blocked_id = c.author_id) or (b.blocker_id = c.author_id and b.blocked_id = ${viewer}))` : sql``}
				order by c.created_at asc limit 500`);
			return rows.map((r) => ({
				id: r.id,
				author: { userId: r.author_id, handle: r.handle, displayName: r.display_name, avatar: avatar(r.avatar_key) },
				nodes: parsePost(r.body),
				spoiler: r.spoiler,
				createdAt: new Date(r.created_at).toISOString(),
				editedAt: r.edited_at ? new Date(r.edited_at).toISOString() : null,
				likes: r.likes,
				liked: r.liked,
				canDelete: viewer === r.author_id || viewer === post?.authorId
			}));
		},

		async addComment(userId: string, postId: string, input: { body: string; spoiler?: boolean }) {
			if (!(await canSee(userId, postId))) throw new NotFound();
			const body = input.body.replace(/\r\n/g, '\n').trim();
			if (!body || visibleLength(body) > COMMENT_MAX) throw new InvalidPost('length');
			const post = (await db.query.posts.findFirst({ where: eq(posts.id, postId), columns: { authorId: true } }))!;
			const [blocked] = await db.execute(sql`select 1 from blocks where (blocker_id = ${post.authorId} and blocked_id = ${userId}) or (blocker_id = ${userId} and blocked_id = ${post.authorId}) limit 1`);
			if (blocked) throw new Forbidden();
			const [c] = await db.insert(comments).values({ postId, authorId: userId, body, spoiler: !!input.spoiler }).returning({ id: comments.id });
			await notifications.notify(post.authorId, 'comment', { actorId: userId, data: { url: `/p/${postId}#c-${c!.id}` } });
			const handles = extractRefs(body).mentions;
			if (handles.length) {
				const people = await db.select({ userId: profiles.userId }).from(profiles).where(inArray(sql`lower(${profiles.handle})`, handles));
				await notifyMentions(postId, userId, people.map((p) => p.userId).filter((u) => u !== userId && u !== post.authorId));
			}
			return c!.id;
		},

		/** The comment's author or the post's author may delete it. */
		async deleteComment(userId: string, commentId: string) {
			const c = await db.query.comments.findFirst({ where: eq(comments.id, commentId) });
			if (!c) throw new NotFound();
			const post = await db.query.posts.findFirst({ where: eq(posts.id, c.postId), columns: { authorId: true } });
			if (c.authorId !== userId && post?.authorId !== userId) throw new Forbidden();
			await db.delete(comments).where(eq(comments.id, commentId));
			await db.delete(likes).where(and(eq(likes.targetType, 'comment'), eq(likes.targetId, commentId)));
		},

		/**
		 * Home feed: posts, finished reads and new public lists from people I follow, my friends
		 * and me — newest first, keyset-paginated, every item checked with can_view().
		 */
		async feed(viewer: string, cursor?: string | null, limit = 20) {
			const c = decodeCursor(cursor);
			const after = (at: ReturnType<typeof sql>, id: ReturnType<typeof sql>) => (c ? sql`and (${at}, ${id}::text) < (${c.at}::timestamptz, ${c.id})` : sql``);
			const rows = await db.execute<{ kind: 'post' | 'read' | 'list'; id: string; actor: string; at: Date }>(sql`
				with circle as (
					select followee_id as uid from follows where follower_id = ${viewer}
					union select case when user_low = ${viewer} then user_high else user_low end from friendships where status = 'accepted' and (user_low = ${viewer} or user_high = ${viewer})
					union select ${viewer}::uuid
				)
				select x.* from (
					(select 'post' as kind, p.id::text as id, p.author_id as actor, p.created_at as at from posts p
						where p.author_id in (select uid from circle) and ${visiblePost(viewer)} ${after(sql`p.created_at`, sql`p.id`)}
						order by p.created_at desc, p.id desc limit ${limit + 1})
					union all
					(select 'read', r.id::text, r.user_id, r.finished_at from reads r
						where r.user_id in (select uid from circle) and r.outcome = 'finished' and r.finished_at is not null
							and can_view(${viewer}, r.user_id, r.visibility) ${after(sql`r.finished_at`, sql`r.id`)}
						order by r.finished_at desc, r.id desc limit ${limit + 1})
					union all
					(select 'list', l.id::text, l.owner_id, l.created_at from readlists l
						where l.owner_id in (select uid from circle) and l.visibility = 'public' and l.hidden_at is null ${after(sql`l.created_at`, sql`l.id`)}
						order by l.created_at desc, l.id desc limit ${limit + 1})
				) x
				join profiles a on a.user_id = x.actor and a.hidden_at is null and a.suspended_at is null and a.deletion_requested_at is null
				order by x.at desc, x.id desc limit ${limit + 1}`);
			const more = rows.length > limit;
			const items = rows.slice(0, limit);
			const last = items.at(-1);
			const ids = (k: string) => items.filter((i) => i.kind === k).map((i) => i.id);

			const [postViews, readRows, listRows, actors] = await Promise.all([
				hydrate(viewer, ids('post')),
				ids('read').length
					? db.execute<{ id: string; work_id: string; title: string; authors: string[]; cover_key: string | null; cover_source_url: string | null; rating: number | null; review: string; review_spoiler: boolean }>(sql`
						select r.id, r.work_id, w.title, r.rating, r.review, r.review_spoiler, e.cover_key, e.cover_source_url,
							coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = w.id), '{}') as authors
						from reads r join works w on w.id = r.work_id
						left join lateral (select cover_key, cover_source_url from editions where id = coalesce(r.edition_id, (select id from editions where work_id = w.id order by (cover_status = 'ready') desc, metadata_quality desc limit 1))) e on true
						where r.id in ${ids('read')}`)
					: Promise.resolve([]),
				ids('list').length
					? db.execute<{ id: string; title: string; slug: string; count: number; covers: { key: string | null; src: string | null }[] | null }>(sql`
						select l.id, l.title, l.slug, (select count(*)::int from readlist_items i where i.readlist_id = l.id) as count,
							(select json_agg(c) from (select e.cover_key as key, e.cover_source_url as src from readlist_items i
								left join lateral (select cover_key, cover_source_url from editions where id = coalesce(i.edition_id, (select id from editions where work_id = i.work_id order by (cover_status = 'ready') desc, metadata_quality desc limit 1))) e on true
								where i.readlist_id = l.id order by i.position limit 3) c) as covers
						from readlists l where l.id in ${ids('list')}`)
					: Promise.resolve([]),
				items.length
					? db.select({ userId: profiles.userId, handle: profiles.handle, displayName: profiles.displayName, avatarKey: profiles.avatarKey }).from(profiles).where(inArray(profiles.userId, [...new Set(items.map((i) => i.actor))]))
					: Promise.resolve([])
			]);
			const actor = (id: string): Author => {
				const a = actors.find((x) => x.userId === id)!;
				return { userId: a.userId, handle: a.handle, displayName: a.displayName, avatar: avatar(a.avatarKey) };
			};
			const feed: FeedItem[] = [];
			for (const it of items) {
				const at = new Date(it.at).toISOString();
				const key = `${it.kind}:${it.id}`;
				if (it.kind === 'post') {
					const p = postViews.find((x) => x.id === it.id);
					if (p) feed.push({ kind: 'post', at, key, post: p });
				} else if (it.kind === 'read') {
					const r = readRows.find((x) => x.id === it.id);
					if (r)
						feed.push({
							kind: 'read',
							at,
							key,
							id: r.id,
							actor: actor(it.actor),
							outcome: 'finished',
							book: { workId: r.work_id, title: r.title, authors: r.authors, cover: cover(r.cover_key, r.cover_source_url) },
							rating: r.rating,
							review: r.review.slice(0, 600),
							reviewSpoiler: r.review_spoiler
						});
				} else {
					const l = listRows.find((x) => x.id === it.id);
					if (l) feed.push({ kind: 'list', at, key, id: l.id, actor: actor(it.actor), title: l.title, slug: l.slug, count: l.count, covers: (l.covers ?? []).map((c) => cover(c.key, c.src)) });
				}
			}
			return { items: feed, next: more && last ? encodeCursor(new Date(last.at).toISOString(), last.id) : null };
		},

		/** For link previews: plain text with spoilers hidden (whole-post spoilers say so instead). */
		async preview(postId: string) {
			const [r] = await db.execute<{ body: string; spoiler: boolean; visibility: string; hidden: boolean; handle: string; display_name: string; avatar_key: string | null; first_work: string | null; locale: string }>(sql`
				select p.body, p.spoiler, p.visibility, p.hidden_at is not null as hidden, a.handle, a.display_name, a.avatar_key, a.locale,
					(select work_id from post_book_refs r where r.post_id = p.id limit 1) as first_work
				from posts p join profiles a on a.user_id = p.author_id where p.id = ${postId}`);
			if (!r || r.hidden || r.visibility !== 'public') return null;
			return { text: r.spoiler ? null : toPlain(r.body), spoiler: r.spoiler, handle: r.handle, name: r.display_name, avatarKey: r.avatar_key, firstWork: r.first_work, locale: r.locale === 'pl' ? ('pl' as const) : ('en' as const) };
		}
	};
	return api;
}

export type Posts = ReturnType<typeof createPosts>;
