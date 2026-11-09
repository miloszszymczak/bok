import { foldText, pair } from '@bok/core';
import { blocks, comments, follows, friendships, posts, profiles, readlists, reports, session, type Db } from '@bok/db';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { Kv } from './valkey.ts';
import type { Notifications } from './notifications.ts';
import type { Storage } from './storage.ts';
import { Forbidden, NotFound } from './shelves.ts';

export interface Relationship {
	self: boolean;
	following: boolean;
	followedBy: boolean;
	friend: 'none' | 'requested' | 'incoming' | 'friends';
	blocked: 'none' | 'by_me' | 'by_them';
}

export interface PersonRow {
	userId: string;
	handle: string;
	displayName: string;
	avatar: string | null;
	bio: string;
	/** Relation to the viewer (for "follows you" / "friend" badges). */
	followsYou: boolean;
	youFollow: boolean;
	friends: boolean;
}

export const REPORT_REASONS = ['spam', 'abuse', 'inappropriate', 'impersonation', 'other'] as const;
export type ReportTarget = 'profile' | 'post' | 'comment' | 'readlist';

export function createSocial(deps: { db: Db; kv: Kv; storage: Storage; notifications: Notifications }) {
	const { db, kv, storage, notifications } = deps;
	const avatar = (k: string | null) => (k ? storage.url(k) : null);

	/** Visible to others: not hidden, suspended or being deleted. */
	const visibleProfile = sql`${profiles.hiddenAt} is null and ${profiles.suspendedAt} is null and ${profiles.deletionRequestedAt} is null`;

	async function relationship(viewerId: string | null, ownerId: string): Promise<Relationship> {
		if (!viewerId) return { self: false, following: false, followedBy: false, friend: 'none', blocked: 'none' };
		if (viewerId === ownerId) return { self: true, following: false, followedBy: false, friend: 'none', blocked: 'none' };
		const [lo, hi] = pair(viewerId, ownerId);
		const [r] = await db.execute<{ following: boolean; followed_by: boolean; fstatus: string | null; requested_by: string | null; blocked_by_me: boolean; blocked_by_them: boolean }>(sql`
			select
				exists(select 1 from follows where follower_id = ${viewerId} and followee_id = ${ownerId}) as following,
				exists(select 1 from follows where follower_id = ${ownerId} and followee_id = ${viewerId}) as followed_by,
				(select status::text from friendships where user_low = ${lo} and user_high = ${hi}) as fstatus,
				(select requested_by from friendships where user_low = ${lo} and user_high = ${hi}) as requested_by,
				exists(select 1 from blocks where blocker_id = ${viewerId} and blocked_id = ${ownerId}) as blocked_by_me,
				exists(select 1 from blocks where blocker_id = ${ownerId} and blocked_id = ${viewerId}) as blocked_by_them`);
		const friend = r?.fstatus === 'accepted' ? 'friends' : r?.fstatus === 'pending' ? (r.requested_by === viewerId ? 'requested' : 'incoming') : 'none';
		return {
			self: false,
			following: !!r?.following,
			followedBy: !!r?.followed_by,
			friend,
			blocked: r?.blocked_by_me ? 'by_me' : r?.blocked_by_them ? 'by_them' : 'none'
		};
	}

	async function assertCanInteract(viewerId: string, ownerId: string) {
		if (viewerId === ownerId) throw new Forbidden();
		const rel = await relationship(viewerId, ownerId);
		if (rel.blocked !== 'none') throw new Forbidden();
		const target = await db.query.profiles.findFirst({ where: eq(profiles.userId, ownerId), columns: { hiddenAt: true, suspendedAt: true } });
		if (!target || target.hiddenAt || target.suspendedAt) throw new NotFound();
		return rel;
	}

	async function people(viewerId: string | null, where: ReturnType<typeof sql>, order = sql`p.display_name`) {
		const rows = await db.execute<{ user_id: string; handle: string; display_name: string; avatar_key: string | null; bio: string; follows_you: boolean; you_follow: boolean; friends: boolean }>(sql`
			select p.user_id, p.handle, p.display_name, p.avatar_key, p.bio,
				${viewerId ? sql`exists(select 1 from follows f where f.follower_id = p.user_id and f.followee_id = ${viewerId})` : sql`false`} as follows_you,
				${viewerId ? sql`exists(select 1 from follows f where f.follower_id = ${viewerId} and f.followee_id = p.user_id)` : sql`false`} as you_follow,
				${viewerId ? sql`exists(select 1 from friendships x where x.status = 'accepted' and x.user_low = least(p.user_id, ${viewerId}::uuid) and x.user_high = greatest(p.user_id, ${viewerId}::uuid))` : sql`false`} as friends
			from profiles p
			where p.hidden_at is null and p.suspended_at is null and p.deletion_requested_at is null
				${viewerId ? sql`and not exists (select 1 from blocks b where (b.blocker_id = ${viewerId} and b.blocked_id = p.user_id) or (b.blocker_id = p.user_id and b.blocked_id = ${viewerId}))` : sql``}
				and ${where}
			order by ${order}
			limit 200`);
		return rows.map((r) => ({
			userId: r.user_id,
			handle: r.handle,
			displayName: r.display_name,
			avatar: avatar(r.avatar_key),
			bio: r.bio,
			followsYou: r.follows_you,
			youFollow: r.you_follow,
			friends: r.friends
		})) satisfies PersonRow[];
	}

	const api = {
		relationship,

		/** Public profile (null when missing, hidden, suspended, deleted, or blocked either way). */
		async profile(viewerId: string | null, handle: string) {
			const p = await db.query.profiles.findFirst({ where: and(eq(profiles.handle, handle), sql`${visibleProfile}`) });
			if (!p) return null;
			const rel = await relationship(viewerId, p.userId);
			if (rel.blocked === 'by_them') return null;
			const [counts] = await db.execute<{ followers: number; following: number; friends: number }>(sql`
				select (select count(*)::int from follows where followee_id = ${p.userId}) as followers,
					(select count(*)::int from follows where follower_id = ${p.userId}) as following,
					(select count(*)::int from friendships where status = 'accepted' and (user_low = ${p.userId} or user_high = ${p.userId})) as friends`);
			return { profile: p, avatar: avatar(p.avatarKey), rel, counts: counts ?? { followers: 0, following: 0, friends: 0 } };
		},

		async follow(viewerId: string, ownerId: string) {
			await assertCanInteract(viewerId, ownerId);
			const res = await db.insert(follows).values({ followerId: viewerId, followeeId: ownerId }).onConflictDoNothing().returning();
			if (res.length) await notifications.notify(ownerId, 'follow', { actorId: viewerId, dedupeKey: `follow:${viewerId}:${ownerId}:${new Date().toISOString().slice(0, 10)}` });
		},

		async unfollow(viewerId: string, ownerId: string) {
			await db.delete(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, ownerId)));
		},

		/** Remove someone from my followers. */
		async removeFollower(ownerId: string, followerId: string) {
			await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followeeId, ownerId)));
		},

		/** Send a request — or accept theirs if they already asked. */
		async requestFriend(viewerId: string, ownerId: string) {
			const rel = await assertCanInteract(viewerId, ownerId);
			if (rel.friend === 'friends' || rel.friend === 'requested') return rel.friend;
			if (rel.friend === 'incoming') return api.acceptFriend(viewerId, ownerId);
			const [lo, hi] = pair(viewerId, ownerId);
			await db.insert(friendships).values({ userLow: lo, userHigh: hi, requestedBy: viewerId }).onConflictDoNothing();
			// One notification a day per pair: declining and re-sending must not become a way to spam someone.
			await notifications.notify(ownerId, 'friend_request', { actorId: viewerId, data: { url: '/people/requests' }, dedupeKey: `friend_request:${viewerId}:${ownerId}:${new Date().toISOString().slice(0, 10)}` });
			return 'requested' as const;
		},

		async acceptFriend(viewerId: string, requesterId: string) {
			const [lo, hi] = pair(viewerId, requesterId);
			const res = await db
				.update(friendships)
				.set({ status: 'accepted', acceptedAt: new Date() })
				.where(and(eq(friendships.userLow, lo), eq(friendships.userHigh, hi), eq(friendships.status, 'pending'), eq(friendships.requestedBy, requesterId)))
				.returning();
			if (res.length) await notifications.notify(requesterId, 'friend_accept', { actorId: viewerId });
			return res.length ? ('friends' as const) : ('none' as const);
		},

		/** Decline an incoming request, cancel my own, or unfriend. */
		async endFriendship(viewerId: string, otherId: string) {
			const [lo, hi] = pair(viewerId, otherId);
			await db.delete(friendships).where(and(eq(friendships.userLow, lo), eq(friendships.userHigh, hi)));
		},

		/** Block: drops follows and friendship both ways; the pair can no longer see or reach each other. */
		async block(viewerId: string, otherId: string) {
			if (viewerId === otherId) throw new Forbidden();
			const [lo, hi] = pair(viewerId, otherId);
			await db.transaction(async (tx) => {
				await tx.insert(blocks).values({ blockerId: viewerId, blockedId: otherId }).onConflictDoNothing();
				await tx.delete(follows).where(or(and(eq(follows.followerId, viewerId), eq(follows.followeeId, otherId)), and(eq(follows.followerId, otherId), eq(follows.followeeId, viewerId))));
				await tx.delete(friendships).where(and(eq(friendships.userLow, lo), eq(friendships.userHigh, hi)));
				// Pending borrow requests between the pair are cancelled; active loans stay on record.
				await tx.execute(sql`
					update loans set status = 'cancelled', updated_at = now()
					where status = 'requested' and ((lender_id = ${viewerId} and borrower_id = ${otherId}) or (lender_id = ${otherId} and borrower_id = ${viewerId}))`);
			});
		},

		async unblock(viewerId: string, otherId: string) {
			await db.delete(blocks).where(and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, otherId)));
		},

		async blocked(viewerId: string) {
			const rows = await db
				.select({ userId: profiles.userId, handle: profiles.handle, displayName: profiles.displayName })
				.from(blocks)
				.innerJoin(profiles, eq(profiles.userId, blocks.blockedId))
				.where(eq(blocks.blockerId, viewerId))
				.orderBy(desc(blocks.createdAt));
			return rows;
		},

		followers: (viewerId: string | null, ownerId: string) => people(viewerId, sql`exists(select 1 from follows f where f.follower_id = p.user_id and f.followee_id = ${ownerId})`),
		following: (viewerId: string | null, ownerId: string) => people(viewerId, sql`exists(select 1 from follows f where f.follower_id = ${ownerId} and f.followee_id = p.user_id)`),
		friends: (viewerId: string | null, ownerId: string) =>
			people(viewerId, sql`exists(select 1 from friendships x where x.status = 'accepted' and x.user_low = least(p.user_id, ${ownerId}::uuid) and x.user_high = greatest(p.user_id, ${ownerId}::uuid))`),
		incomingRequests: (viewerId: string) =>
			people(viewerId, sql`exists(select 1 from friendships x where x.status = 'pending' and x.requested_by = p.user_id and x.user_low = least(p.user_id, ${viewerId}::uuid) and x.user_high = greatest(p.user_id, ${viewerId}::uuid))`),
		outgoingRequests: (viewerId: string) =>
			people(viewerId, sql`exists(select 1 from friendships x where x.status = 'pending' and x.requested_by = ${viewerId} and x.user_low = least(p.user_id, ${viewerId}::uuid) and x.user_high = greatest(p.user_id, ${viewerId}::uuid))`),

		/** People search by handle or name (diacritics-insensitive, typo-tolerant). */
		async search(viewerId: string | null, q: string) {
			const f = foldText(q.replace(/^@/, ''));
			if (f.length < 2) return [];
			return people(viewerId, sql`(p.search_name like ${'%' + f.replace(/[%_]/g, '') + '%'} or ${f} <% p.search_name)`, sql`word_similarity(${f}, p.search_name) desc, p.display_name`);
		},

		/** Keep the search column in sync after name/handle changes. */
		async refreshSearchName(userId: string) {
			const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId), columns: { displayName: true, handle: true } });
			if (p) await db.update(profiles).set({ searchName: foldText(`${p.displayName} ${p.handle}`) }).where(eq(profiles.userId, userId));
		},

		// ── Reports & moderation ──
		async report(reporterId: string, input: { targetType: ReportTarget; targetId: string; targetUserId: string; reason: (typeof REPORT_REASONS)[number]; details: string }) {
			if (reporterId === input.targetUserId) throw new Forbidden();
			await db.insert(reports).values({ reporterId, ...input, details: input.details.slice(0, 2000) });
		},

		async openReports() {
			return db.execute<{ id: string; target_type: string; target_id: string; target_user_id: string | null; reason: string; details: string; created_at: Date; reporter_handle: string | null; target_handle: string | null; target_name: string | null; target_bio: string | null; target_hidden: boolean; target_suspended: boolean; open_against: number; target_text: string | null; target_link: string | null }>(sql`
				select r.id, r.target_type, r.target_id, r.target_user_id, r.reason, r.details, r.created_at,
					case r.target_type
						when 'post' then (select body from posts where id = r.target_id)
						when 'comment' then (select body from comments where id = r.target_id)
						when 'readlist' then (select title || ' — ' || description from readlists where id = r.target_id)
						else null end as target_text,
					case r.target_type
						when 'post' then '/p/' || r.target_id
						when 'comment' then (select '/p/' || post_id || '#c-' || id from comments where id = r.target_id)
						when 'readlist' then (select '/l/' || slug from readlists where id = r.target_id)
						else null end as target_link,
					rp.handle as reporter_handle, tp.handle as target_handle, tp.display_name as target_name, tp.bio as target_bio,
					tp.hidden_at is not null as target_hidden, tp.suspended_at is not null as target_suspended,
					(select count(*)::int from reports o where o.target_user_id = r.target_user_id and o.status = 'open') as open_against
				from reports r
				left join profiles rp on rp.user_id = r.reporter_id
				left join profiles tp on tp.user_id = r.target_user_id
				where r.status = 'open'
				order by r.created_at asc
				limit 200`);
		},

		/** dismiss | hide (profile not shown) | suspend (hidden + signed out + can't sign in) | restore. */
		async resolve(adminId: string, reportId: string, action: 'dismiss' | 'hide' | 'suspend') {
			const r = await db.query.reports.findFirst({ where: eq(reports.id, reportId) });
			if (!r) throw new NotFound();
			await db.transaction(async (tx) => {
				// Hide the reported content itself (posts, comments, lists).
				if (action !== 'dismiss') {
					const now = new Date();
					if (r.targetType === 'post') await tx.update(posts).set({ hiddenAt: now }).where(eq(posts.id, r.targetId));
					if (r.targetType === 'comment') await tx.update(comments).set({ hiddenAt: now }).where(eq(comments.id, r.targetId));
					if (r.targetType === 'readlist') await tx.update(readlists).set({ hiddenAt: now }).where(eq(readlists.id, r.targetId));
				}
				if (r.targetUserId && (action === 'suspend' || (action === 'hide' && r.targetType === 'profile'))) {
					const now = new Date();
					await tx
						.update(profiles)
						.set(action === 'suspend' ? { hiddenAt: now, suspendedAt: now } : { hiddenAt: now })
						.where(eq(profiles.userId, r.targetUserId));
				}
				// Close every open report about the same account with the same decision.
				// Suspending closes every open report about that account; otherwise just this target's reports.
				await tx
					.update(reports)
					.set({ status: action === 'dismiss' ? 'dismissed' : 'actioned', action, resolvedBy: adminId, resolvedAt: new Date() })
					.where(
						action === 'suspend' && r.targetUserId
							? and(eq(reports.targetUserId, r.targetUserId), eq(reports.status, 'open'))
							: and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, 'open'))
					);
			});
			if (action === 'suspend' && r.targetUserId) {
				// Sessions also live in Valkey — drop both so the account is signed out everywhere now.
				const tokens = await db.select({ token: session.token }).from(session).where(eq(session.userId, r.targetUserId));
				for (const { token } of tokens) await kv.del(`auth:${token}`);
				await kv.del(`auth:active-sessions-${r.targetUserId}`);
				await db.delete(session).where(eq(session.userId, r.targetUserId));
			}
		},

		async restore(userId: string) {
			await db.update(profiles).set({ hiddenAt: null, suspendedAt: null }).where(eq(profiles.userId, userId));
		},

		async isSuspended(userId: string) {
			const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId), columns: { suspendedAt: true } });
			return !!p?.suspendedAt;
		}
	};
	return api;
}

export type Social = ReturnType<typeof createSocial>;
