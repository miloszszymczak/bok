import type { BookRecord, ProviderName, ProviderResult } from './types.ts';

type Field = keyof BookRecord;

// Who wins for each field. National library data is curated; Google/OL descriptions are richer.
const BIBLIO: ProviderName[] = ['bn', 'openlibrary', 'isbndb', 'googlebooks', 'crossref'];
const PRIORITY: Partial<Record<Field, ProviderName[]>> = {
	description: ['googlebooks', 'openlibrary', 'isbndb'],
	language: ['bn', 'googlebooks', 'openlibrary', 'isbndb'],
	pageCount: ['bn', 'openlibrary', 'googlebooks', 'isbndb'],
	series: ['bn', 'openlibrary'],
	subjects: ['openlibrary', 'googlebooks'],
	olWorkKey: ['openlibrary']
};

const isEmpty = (v: unknown) =>
	v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function mergeRecords(results: ProviderResult[]): BookRecord | null {
	const hits = new Map<ProviderName, BookRecord>();
	for (const r of results) if (r.status === 'hit' && r.record) hits.set(r.provider, r.record);
	if (hits.size === 0) return null;

	const fields = new Set<Field>();
	for (const rec of hits.values()) for (const k of Object.keys(rec) as Field[]) fields.add(k);

	const out: BookRecord = {};
	for (const field of fields) {
		if (field === 'coverUrls') continue;
		const order = PRIORITY[field] ?? BIBLIO;
		for (const p of [...order, ...BIBLIO]) {
			const v = hits.get(p)?.[field];
			if (!isEmpty(v)) {
				(out as Record<string, unknown>)[field] = v;
				break;
			}
		}
	}
	// Covers: keep every candidate in priority order; the cover job tries them until one is usable.
	const covers: string[] = [];
	for (const p of ['openlibrary', 'googlebooks', 'isbndb'] as ProviderName[]) {
		for (const u of hits.get(p)?.coverUrls ?? []) if (!covers.includes(u)) covers.push(u);
	}
	if (covers.length) out.coverUrls = covers;
	// Year fallback: derive from date if the winning source had no year.
	if (!out.publishedYear && out.publishedDate) {
		const m = /(1[5-9]\d\d|20\d\d)/.exec(out.publishedDate);
		if (m) out.publishedYear = Number(m[1]);
	}
	return out;
}

/** 0–100 completeness score used to decide on paid fallbacks and background refreshes. */
export function qualityScore(r: BookRecord | null): number {
	if (!r) return 0;
	let s = 0;
	if (r.title) s += 30;
	if (r.contributors?.some((c) => c.role === 'author')) s += 20;
	if (r.coverUrls?.length) s += 15;
	if (r.pageCount) s += 10;
	if (r.description) s += 10;
	if (r.publisher) s += 5;
	if (r.publishedYear) s += 5;
	if (r.language) s += 5;
	return s;
}
