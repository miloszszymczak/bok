import { REPORT_REASONS } from '@bok/server';
import { error, fail } from '@sveltejs/kit';
import { ORIGIN } from '$app/env/private';
import { guard } from '#lib/server/api.ts';
import { ogVersion } from '#lib/server/og-version.ts';
import type { Actions, PageServerLoad } from './$types';

const TABS = ['log', 'library', 'stats', 'readlists', 'posts', 'lending'] as const;

async function target(locals: App.Locals, handle: string) {
	const p = await locals.svc.social.profile(locals.user?.id ?? null, handle);
	if (!p) error(404, 'Not found');
	return p;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const viewerId = locals.user?.id ?? null;
	const p = await target(locals, params.handle);
	const owner = p.profile.userId;
	const tab = (TABS as readonly string[]).includes(url.searchParams.get('tab') ?? '') ? (url.searchParams.get('tab') as (typeof TABS)[number]) : 'log';
	const { reading, shelves } = locals.svc;
	const blockedByMe = p.rel.blocked === 'by_me';
	const year = await reading.currentYear(owner);
	const lists = !blockedByMe && tab === 'readlists' ? await locals.svc.readlists.onProfile(owner, viewerId) : [];
	const postsPage = !blockedByMe && tab === 'posts' ? await locals.svc.posts.byAuthor(viewerId, owner, url.searchParams.get('cursor')) : { posts: [], next: null };
	const lending = !blockedByMe && tab === 'lending' && viewerId && viewerId !== owner ? await locals.svc.loans.lendable(viewerId, { ownerId: owner }) : [];
	const [log, libraryBooks, stats] = blockedByMe
		? [[], null, null]
		: await Promise.all([
				tab === 'log' ? reading.log(owner, { viewerId }) : Promise.resolve([]),
				tab === 'library' ? shelves.publicLibrary(viewerId, owner) : Promise.resolve(null),
				reading.stats(owner, viewerId, year)
			]);
	return {
		og: {
			url: `${ORIGIN}/u/${p.profile.handle}`,
			image: `${ORIGIN}/og/u/${p.profile.handle}.png?v=${ogVersion([p.profile.displayName, p.profile.handle, p.profile.avatarKey, p.counts.followers])}`
		},
		tab,
		person: {
			userId: owner,
			handle: p.profile.handle,
			displayName: p.profile.displayName,
			bio: p.profile.bio,
			avatarUrl: p.avatar,
			joined: p.profile.createdAt.toISOString(),
			isMe: p.rel.self
		},
		rel: p.rel,
		counts: p.counts,
		stats,
		year,
		log: log.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
		library: libraryBooks,
		lists,
		posts: postsPage.posts,
		postsNext: postsPage.next,
		lending,
		reasons: REPORT_REASONS
	};
};

async function run(locals: App.Locals, handle: string, fn: (me: string, owner: string) => Promise<unknown>) {
	if (!locals.user) return fail(401);
	const p = await target(locals, handle);
	await guard(() => fn(locals.user!.id, p.profile.userId));
	return { ok: true };
}

export const actions: Actions = {
	follow: ({ locals, params }) => run(locals, params.handle, (me, o) => locals.svc.social.follow(me, o)),
	unfollow: ({ locals, params }) => run(locals, params.handle, (me, o) => locals.svc.social.unfollow(me, o)),
	friend: ({ locals, params }) => run(locals, params.handle, (me, o) => locals.svc.social.requestFriend(me, o)),
	accept: ({ locals, params }) => run(locals, params.handle, (me, o) => locals.svc.social.acceptFriend(me, o)),
	unfriend: ({ locals, params }) => run(locals, params.handle, (me, o) => locals.svc.social.endFriendship(me, o)),
	block: ({ locals, params }) => run(locals, params.handle, (me, o) => locals.svc.social.block(me, o)),
	unblock: ({ locals, params }) => run(locals, params.handle, (me, o) => locals.svc.social.unblock(me, o)),
	report: async ({ locals, params, request }) => {
		const f = await request.formData();
		const reason = String(f.get('reason') ?? '');
		if (!(REPORT_REASONS as readonly string[]).includes(reason)) return fail(400, { reportError: true });
		const res = await run(locals, params.handle, (me, o) =>
			locals.svc.social.report(me, { targetType: 'profile', targetId: o, targetUserId: o, reason: reason as (typeof REPORT_REASONS)[number], details: String(f.get('details') ?? '') })
		);
		return { reported: true, ...res };
	}
};
