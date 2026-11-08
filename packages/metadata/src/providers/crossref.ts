import { formatIssn } from '@bok/core';
import type { Provider } from '../types.ts';
import { getJson } from '../util.ts';

/** Journals by ISSN — https://api.crossref.org/swagger-ui/index.html */
export const crossref: Provider = {
	name: 'crossref',
	supports: (id) => id.kind === 'issn',
	async lookup(id, ctx) {
		if (id.kind !== 'issn') return null;
		const res = await getJson<{ message?: { title?: string; publisher?: string; ISSN?: string[] } }>(
			`https://api.crossref.org/journals/${formatIssn(id.issn)}`,
			ctx
		);
		const m = res?.message;
		if (!m?.title) return null;
		return { raw: m, record: { issn: id.issn, title: m.title, publisher: m.publisher } };
	}
};
