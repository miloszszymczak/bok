import type { Identifier } from '@bok/core';
import type { BookFormat, BookRecord, Provider, ProviderContext } from '../types.ts';
import { getJson, normLanguage, pagesFrom, yearFrom } from '../util.ts';

interface OlData {
	title?: string;
	subtitle?: string;
	authors?: { name: string }[];
	publishers?: { name: string }[];
	publish_date?: string;
	number_of_pages?: number;
	cover?: { large?: string; medium?: string };
	subjects?: { name: string }[];
}
interface OlEdition {
	works?: { key: string }[];
	physical_format?: string;
	languages?: { key: string }[];
	description?: string | { value: string };
	number_of_pages?: number;
	pagination?: string;
	covers?: number[];
	series?: string[];
	edition_name?: string;
	isbn_10?: string[];
	key?: string;
}

const BASE = 'https://openlibrary.org';

export function formatFrom(s: string | undefined): BookFormat | undefined {
	if (!s) return undefined;
	const f = s.toLowerCase();
	if (/paper|soft|miękk|broszur/.test(f)) return 'paperback';
	if (/hard|tward|cloth/.test(f)) return 'hardcover';
	if (/e-?book|kindle|epub/.test(f)) return 'ebook';
	if (/audio/.test(f)) return 'audiobook';
	return undefined;
}

export function parseOpenLibrary(isbn13: string, data: OlData | undefined, ed: OlEdition | null): BookRecord | null {
	if (!data && !ed) return null;
	const covers: string[] = [];
	for (const c of ed?.covers ?? []) if (c > 0) covers.push(`https://covers.openlibrary.org/b/id/${c}-L.jpg?default=false`);
	if (data?.cover?.large) covers.push(data.cover.large);
	const desc = typeof ed?.description === 'string' ? ed.description : ed?.description?.value;
	const series = ed?.series?.[0];
	return {
		isbn13,
		isbn10: ed?.isbn_10?.[0],
		title: data?.title,
		subtitle: data?.subtitle,
		contributors: data?.authors?.map((a) => ({ name: a.name, role: 'author' as const })),
		publisher: data?.publishers?.[0]?.name,
		publishedDate: data?.publish_date,
		publishedYear: yearFrom(data?.publish_date),
		pageCount: data?.number_of_pages ?? ed?.number_of_pages ?? pagesFrom(ed?.pagination),
		language: normLanguage(ed?.languages?.[0]?.key),
		format: formatFrom(ed?.physical_format),
		editionStatement: ed?.edition_name,
		series: series ? { name: series.replace(/\s*[;,]\s*(no\.?|#|t\.)?\s*\d+.*$/i, '').trim(), position: /(\d+)\s*$/.exec(series)?.[1] } : undefined,
		description: desc?.trim(),
		coverUrls: covers,
		subjects: data?.subjects?.slice(0, 15).map((s) => s.name),
		olWorkKey: ed?.works?.[0]?.key,
		externalId: ed?.key
	};
}

export const openLibrary: Provider = {
	name: 'openlibrary',
	supports: (id: Identifier) => id.kind === 'isbn',
	async lookup(id, ctx: ProviderContext) {
		if (id.kind !== 'isbn') return null;
		const isbn = id.isbn13;
		const [dataRes, ed] = await Promise.all([
			getJson<Record<string, OlData>>(`${BASE}/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`, ctx),
			getJson<OlEdition>(`${BASE}/isbn/${isbn}.json`, ctx)
		]);
		const data = dataRes?.[`ISBN:${isbn}`];
		const record = parseOpenLibrary(isbn, data, ed);
		return record?.title ? { record, raw: { data, edition: ed } } : null;
	}
};
