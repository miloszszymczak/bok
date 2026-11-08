import { FORMATS, isWebp, rateLimit, type ManualBook } from '@bok/server';
import { error, fail, redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	isbn: url.searchParams.get('isbn') ?? '',
	title: url.searchParams.get('title') ?? ''
});

const int = (v: FormDataEntryValue | null, min: number, max: number) => {
	const n = Number(String(v ?? '').trim());
	return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user!;
		if (!(await rateLimit(locals.svc.kv, `manual:${user.id}`, 30, 3600))) error(429, 'Too many new books in an hour');
		const f = await request.formData();
		const authors = String(f.get('authors') ?? '')
			.split(/[,;\n]/)
			.map((s) => s.trim())
			.filter(Boolean)
			.slice(0, 10);
		const format = String(f.get('format') ?? '');
		const book: ManualBook = {
			title: String(f.get('title') ?? '').trim().slice(0, 300),
			subtitle: String(f.get('subtitle') ?? '').trim().slice(0, 300) || undefined,
			authors,
			publisher: String(f.get('publisher') ?? '').trim().slice(0, 200) || undefined,
			year: int(f.get('year'), 1400, new Date().getFullYear() + 2),
			pages: int(f.get('pages'), 1, 20000),
			language: String(f.get('language') ?? '').trim().slice(0, 8) || undefined,
			format: (FORMATS as string[]).includes(format) ? (format as ManualBook['format']) : undefined,
			isbn: String(f.get('isbn') ?? '').trim() || undefined,
			description: String(f.get('description') ?? '').trim().slice(0, 5000) || undefined
		};
		const values = { ...book, authors: authors.join(', ') };
		if (!book.title) return fail(400, { values, error: m.add_err_title() });

		const res = await locals.svc.editor.createManual(book, user.id);

		// Cover photo variants (optional) — produced on the device.
		const s = f.get('cover_s'), md = f.get('cover_m'), l = f.get('cover_l');
		if (!res.existed && s instanceof File && md instanceof File && l instanceof File && s.size && l.size <= 768 * 1024) {
			const set = { s: new Uint8Array(await s.arrayBuffer()), m: new Uint8Array(await md.arrayBuffer()), l: new Uint8Array(await l.arrayBuffer()) };
			if (isWebp(set.s) && isWebp(set.m) && isWebp(set.l)) await locals.svc.editor.setCover(res.editionId, set, user.id);
		}
		if (f.get('addToLibrary')) await locals.svc.library.addCopy(user.id, res.editionId);
		redirect(303, `/book/${res.workId}?e=${res.editionId}${res.existed ? '&existed=1' : ''}`);
	}
};
