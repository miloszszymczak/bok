import { authors, editions, user as users, workAuthors, works } from '@bok/db';
import { FORMATS, rateLimit, type EditionPatch } from '@bok/server';
import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

/** From the DB, not the cached session: the address may have been confirmed on another device. */
async function isVerified(locals: App.Locals) {
	if (!locals.user) return false;
	const u = await locals.svc.db.query.user.findFirst({ where: eq(users.id, locals.user.id), columns: { emailVerified: true } });
	return !!u?.emailVerified;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const e = url.searchParams.get('e') ?? '';
	if (!UUID.test(params.id) || !UUID.test(e)) error(404, 'Not found');
	const { db } = locals.svc;
	const [work, edition, names] = await Promise.all([
		db.query.works.findFirst({ where: eq(works.id, params.id) }),
		db.query.editions.findFirst({ where: and(eq(editions.id, e), eq(editions.workId, params.id)) }),
		db
			.select({ name: authors.name })
			.from(workAuthors)
			.innerJoin(authors, eq(authors.id, workAuthors.authorId))
			.where(eq(workAuthors.workId, params.id))
			.orderBy(asc(workAuthors.position))
	]);
	if (!work || !edition) error(404, 'Not found');
	return {
		canEdit: await isVerified(locals),
		work: { id: work.id, title: work.title, originalTitle: work.originalTitle ?? '', firstPublishedYear: work.firstPublishedYear ?? '', authors: names.map((n) => n.name).join(', ') },
		edition: {
			id: edition.id,
			title: edition.title,
			subtitle: edition.subtitle ?? '',
			publisher: edition.publisher ?? '',
			publishedYear: edition.publishedYear ?? '',
			pageCount: edition.pageCount ?? '',
			language: edition.language ?? '',
			format: edition.format ?? '',
			editionStatement: edition.editionStatement ?? '',
			seriesName: edition.seriesName ?? '',
			seriesPosition: edition.seriesPosition ?? '',
			description: edition.description ?? '',
			isbn13: edition.isbn13
		}
	};
};

const str = (f: FormData, k: string, max = 300) => {
	const v = String(f.get(k) ?? '').trim().slice(0, max);
	return v || null;
};
const int = (f: FormData, k: string, min: number, max: number) => {
	const raw = String(f.get(k) ?? '').trim();
	if (!raw) return null;
	const n = Number(raw);
	return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

export const actions: Actions = {
	default: async ({ request, locals, params, url }) => {
		const user = locals.user!;
		if (!(await isVerified(locals))) return fail(403, { error: m.edit_need_verified() });
		if (!(await rateLimit(locals.svc.kv, `edit:${user.id}`, 60, 3600))) return fail(429, { error: m.auth_err_rate() });
		const f = await request.formData();
		const editionId = url.searchParams.get('e') ?? '';
		const year = int(f, 'publishedYear', 1400, new Date().getFullYear() + 2);
		const pages = int(f, 'pageCount', 1, 20000);
		const firstYear = int(f, 'firstPublishedYear', -3000, new Date().getFullYear() + 2);
		const workTitle = str(f, 'workTitle');
		const edTitle = str(f, 'title');
		if (!workTitle || !edTitle) return fail(400, { error: m.add_err_title() });
		if (year === undefined || pages === undefined || firstYear === undefined) return fail(400, { error: m.edit_err_number() });
		const format = String(f.get('format') ?? '');

		const edPatch: EditionPatch = {
			title: edTitle,
			subtitle: str(f, 'subtitle'),
			publisher: str(f, 'publisher', 200),
			publishedYear: year,
			pageCount: pages,
			language: str(f, 'language', 8),
			format: (FORMATS as string[]).includes(format) ? (format as EditionPatch['format']) : null,
			editionStatement: str(f, 'editionStatement', 200),
			seriesName: str(f, 'seriesName', 200),
			seriesPosition: str(f, 'seriesPosition', 20),
			description: str(f, 'description', 5000)
		};
		const { editor } = locals.svc;
		await editor.editEdition(editionId, edPatch, user.id);
		await editor.editWork(
			params.id,
			{
				title: workTitle,
				originalTitle: str(f, 'originalTitle'),
				firstPublishedYear: firstYear,
				authors: String(f.get('authors') ?? '')
					.split(/[,;\n]/)
					.map((s) => s.trim())
					.filter(Boolean)
					.slice(0, 10)
			},
			user.id
		);
		redirect(303, `/book/${params.id}?e=${editionId}&saved=1`);
	}
};
