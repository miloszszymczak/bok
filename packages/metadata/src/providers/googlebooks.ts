import type { BookRecord, Provider } from '../types.ts';
import { getJson, normLanguage, yearFrom } from '../util.ts';

interface GbVolume {
	id: string;
	volumeInfo: {
		title?: string;
		subtitle?: string;
		authors?: string[];
		publisher?: string;
		publishedDate?: string;
		description?: string;
		pageCount?: number;
		language?: string;
		categories?: string[];
		imageLinks?: { thumbnail?: string; small?: string; medium?: string; large?: string };
		industryIdentifiers?: { type: string; identifier: string }[];
	};
}

export function parseGoogleVolume(v: GbVolume): BookRecord {
	const i = v.volumeInfo;
	const ids = Object.fromEntries((i.industryIdentifiers ?? []).map((x) => [x.type, x.identifier]));
	const img = i.imageLinks;
	const best = img?.large ?? img?.medium ?? img?.small ?? img?.thumbnail;
	const covers = best ? [best.replace(/^http:/, 'https:').replace('&edge=curl', '').replace(/zoom=\d/, 'zoom=0')] : [];
	return {
		isbn13: ids.ISBN_13,
		isbn10: ids.ISBN_10,
		title: i.title,
		subtitle: i.subtitle,
		contributors: i.authors?.map((name) => ({ name, role: 'author' as const })),
		publisher: i.publisher,
		publishedDate: i.publishedDate,
		publishedYear: yearFrom(i.publishedDate),
		pageCount: i.pageCount || undefined,
		language: normLanguage(i.language),
		description: i.description?.replace(/<[^>]+>/g, '').trim(),
		coverUrls: covers,
		subjects: i.categories,
		externalId: v.id
	};
}

export function googleBooks(apiKey: string): Provider {
	return {
		name: 'googlebooks',
		supports: (id) => id.kind === 'isbn',
		async lookup(id, ctx) {
			if (id.kind !== 'isbn') return null;
			const res = await getJson<{ totalItems: number; items?: GbVolume[] }>(
				`https://www.googleapis.com/books/v1/volumes?q=isbn:${id.isbn13}&key=${encodeURIComponent(apiKey)}`,
				ctx
			);
			const v = res?.items?.[0];
			if (!v) return null;
			return { record: { ...parseGoogleVolume(v), isbn13: id.isbn13 }, raw: v };
		}
	};
}
