import { authors, copies, editionContributors, editions, householdMembers, workAuthors, works } from '@bok/db';
import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { coverSrcset, coverUrl } from '#lib/server/media.ts';
import { guard } from '#lib/server/api.ts';
import { finishInput, intOrNull, pick } from '#lib/server/reading-form.ts';
import type { Actions, PageServerLoad } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, url, locals }) => {
	if (!UUID.test(params.id)) error(404, 'Not found');
	const { db, storage } = locals.svc;
	const work = await db.query.works.findFirst({ where: eq(works.id, params.id) });
	if (!work) error(404, 'Not found');

	const [workAuthorRows, eds] = await Promise.all([
		db
			.select({ id: authors.id, name: authors.name })
			.from(workAuthors)
			.innerJoin(authors, eq(authors.id, workAuthors.authorId))
			.where(eq(workAuthors.workId, work.id))
			.orderBy(asc(workAuthors.position)),
		db.query.editions.findMany({
			where: eq(editions.workId, work.id),
			orderBy: [desc(editions.metadataQuality), desc(editions.publishedYear)]
		})
	]);
	const edIds = eds.map((e) => e.id);
	const contributors = edIds.length
		? await db
				.select({ editionId: editionContributors.editionId, name: authors.name, role: editionContributors.role })
				.from(editionContributors)
				.innerJoin(authors, eq(authors.id, editionContributors.authorId))
				.where(inArray(editionContributors.editionId, edIds))
				.orderBy(asc(editionContributors.position))
		: [];

	let owned: Record<string, number> = {};
	if (locals.user && edIds.length) {
		const rows = await db
			.select({ editionId: copies.editionId, n: sql<number>`count(*)::int` })
			.from(copies)
			.where(
				and(
					inArray(copies.editionId, edIds),
					sql`${copies.householdId} in (select household_id from ${householdMembers} where user_id = ${locals.user.id})`
				)
			)
			.groupBy(copies.editionId);
		owned = Object.fromEntries(rows.map((r) => [r.editionId, r.n]));
	}

	// Where are my copies? (any edition of this work, in any of my households)
	const { shelves } = locals.svc;
	const mine = locals.user ? await shelves.copiesOfWorks(locals.user.id, [work.id]) : [];
	const sketches = await shelves.sketches([...new Set(mine.map((c) => c.place?.containerId).filter((x): x is string => !!x))]);
	const tree = mine.length ? await shelves.tree(locals.user!.id).catch(() => null) : null;
	const { reading } = locals.svc;
	const [mineReading, medianRate] = locals.user ? await Promise.all([reading.forWork(locals.user.id, work.id), reading.medianRate(locals.user.id)]) : [null, null];
	const { tagging } = locals.svc;
	const [tagsForWork, seriesList] = await Promise.all([tagging.forWork(locals.user?.id ?? null, work.id), tagging.seriesForWork(locals.user?.id ?? null, work.id)]);

	const selected = eds.find((e) => e.id === url.searchParams.get('e')) ?? eds[0];
	return {
		reading: mineReading
			? {
					status: mineReading.status,
					stuckSource: mineReading.stuckSource,
					current: mineReading.current,
					events: mineReading.events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
					past: mineReading.past
				}
			: null,
		medianRate,
		tags: tagsForWork,
		series: seriesList.filter((x): x is NonNullable<typeof x> => !!x),
		openFinish: url.searchParams.get('finish') === '1',
		myCopies: mine.map((c) => ({
			copyId: c.copyId,
			editionId: c.editionId,
			state: c.state,
			place: c.place,
			sketch: c.place ? (sketches.get(c.place.containerId) ?? null) : null
		})),
		tree,
		work: {
			id: work.id,
			title: work.title,
			subtitle: work.subtitle,
			originalTitle: work.originalTitle,
			firstPublishedYear: work.firstPublishedYear,
			description: work.description
		},
		authors: workAuthorRows,
		selectedId: selected?.id ?? null,
		editions: eds.map((e) => ({
			id: e.id,
			title: e.title,
			subtitle: e.subtitle,
			isbn13: e.isbn13,
			issn: e.issn,
			publisher: e.publisher,
			publishedYear: e.publishedYear,
			publishedDate: e.publishedDate,
			pageCount: e.pageCount,
			language: e.language,
			format: e.format,
			editionStatement: e.editionStatement,
			series: e.seriesName ? { name: e.seriesName, position: e.seriesPosition } : null,
			description: e.description,
			cover: coverUrl(storage, e, 'l'),
			srcset: coverSrcset(storage, e.coverKey),
			coverPending: e.coverStatus === 'pending',
			contributors: contributors.filter((c) => c.editionId === e.id && c.role !== 'author'),
			owned: owned[e.id] ?? 0
		}))
	};
};

export const actions: Actions = {
	status: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401);
		const status = pick((await request.formData()).get('status'), ['want_to_read', 'reading', 'stuck'] as const);
		await guard(() => locals.svc.reading.setStatus(locals.user!.id, params.id, status));
		return { status };
	},
	progress: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const f = await request.formData();
		const progress = intOrNull(f.get('progress'));
		if (progress === null) return fail(400);
		await guard(() =>
			locals.svc.reading.progress(locals.user!.id, String(f.get('readId') ?? ''), {
				progress,
				total: intOrNull(f.get('total')),
				format: pick(f.get('format'), ['paper', 'ebook', 'audiobook'] as const) ?? undefined
			})
		);
		return { progressSaved: true };
	},
	addTag: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401);
		const name = String((await request.formData()).get('tag') ?? '');
		const t = await locals.svc.tagging.add(locals.user.id, params.id, name);
		if (!t) return fail(400, { tagError: true });
		return { tagged: t.slug };
	},
	removeTag: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401);
		await locals.svc.tagging.remove(locals.user.id, params.id, String((await request.formData()).get('slug') ?? ''));
		return { untagged: true };
	},
	finish: async ({ request, params, locals, url }) => {
		if (!locals.user) return fail(401);
		const input = finishInput(await request.formData());
		await guard(() => locals.svc.reading.finish(locals.user!.id, params.id, { ...input, editionId: url.searchParams.get('e') }));
		return { finished: true };
	},
	addCopy: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const editionId = String((await request.formData()).get('editionId') ?? '');
		if (!UUID.test(editionId)) return fail(400);
		await locals.svc.library.addCopy(locals.user.id, editionId);
		return { added: editionId };
	}
};
