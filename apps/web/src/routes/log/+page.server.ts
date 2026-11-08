import { goalProgress } from '@bok/core';
import { fail } from '@sveltejs/kit';
import { intOrNull, pick } from '#lib/server/reading-form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.user!.id;
	const { reading, tagging } = locals.svc;
	const sp = url.searchParams;
	const year = intOrNull(sp.get('year')) ?? undefined;
	const rating = intOrNull(sp.get('rating')) ?? undefined;
	const format = pick(sp.get('format'), ['paper', 'ebook', 'audiobook'] as const) ?? undefined;
	const tagSlug = sp.get('tag');
	const tag = tagSlug ? await tagging.bySlug(tagSlug) : undefined;
	const now = new Date();
	const thisYear = now.getUTCFullYear();
	const [entries, years, target, done, myTags] = await Promise.all([
		reading.log(userId, { year, rating, format, tagId: tag?.id }),
		reading.years(userId),
		reading.goal(userId, thisYear),
		reading.finishedInYear(userId, thisYear),
		tagging.mine(userId)
	]);
	return {
		entries: entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
		years,
		filters: { year: year ?? null, rating: rating ?? null, format: format ?? null, tag: tagSlug },
		myTags,
		goal: { year: thisYear, target, done, progress: target ? goalProgress(target, done, now) : null }
	};
};

export const actions: Actions = {
	goal: async ({ request, locals }) => {
		const f = await request.formData();
		const year = intOrNull(f.get('year')) ?? new Date().getUTCFullYear();
		const target = intOrNull(f.get('target'));
		if (target !== null && (target < 1 || target > 1000)) return fail(400, { goalError: true });
		await locals.svc.reading.setGoal(locals.user!.id, year, target);
		return { goalSaved: true };
	}
};
