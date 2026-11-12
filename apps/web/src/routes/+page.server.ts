import { reviewYear } from '@bok/core';
import { coverSrcset, coverUrl } from '#lib/server/media.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { recent: [], total: 0, inProgress: [], goal: null, feed: { items: [], next: null }, defaultVisibility: 'public' as const, reviewYear: null };
	const { storage, reading, library, posts, accounts } = locals.svc;
	const userId = locals.user.id;
	const year = await reading.currentYear(userId);
	const [recent, inProgress, target, done, feed, profile] = await Promise.all([
		library.recent(userId),
		reading.inProgress(userId),
		reading.goal(userId, year),
		reading.finishedInYear(userId, year),
		posts.feed(userId),
		accounts.getProfile(userId)
	]);
	return {
		reviewYear: reviewYear(new Date()),
		inProgress: inProgress.map((r) => ({ ...r, lastActivityAt: r.lastActivityAt.toISOString() })),
		goal: target ? { year, target, done } : null,
		feed,
		defaultVisibility: profile?.logVisibility ?? 'public',
		total: recent.total,
		recent: recent.books.map((r) => ({ ...r, cover: coverUrl(storage, r, 'm'), srcset: coverSrcset(storage, r.coverKey) }))
	};
};
