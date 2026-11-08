import type { Provider } from '../types.ts';
import { formatFrom } from './openlibrary.ts';
import { getJson, normLanguage, yearFrom } from '../util.ts';

interface IsbndbBook {
	title?: string;
	title_long?: string;
	isbn13?: string;
	isbn10?: string;
	authors?: string[];
	publisher?: string;
	date_published?: string;
	pages?: number;
	language?: string;
	image?: string;
	synopsis?: string;
	binding?: string;
	edition?: string;
}

/** Paid fallback — https://isbndb.com/apidocs/v2 */
export function isbndb(apiKey: string): Provider {
	return {
		name: 'isbndb',
		supports: (id) => id.kind === 'isbn',
		async lookup(id, ctx) {
			if (id.kind !== 'isbn') return null;
			const res = await getJson<{ book?: IsbndbBook }>(`https://api2.isbndb.com/book/${id.isbn13}`, ctx, {
				authorization: apiKey
			});
			const b = res?.book;
			if (!b?.title) return null;
			return {
				raw: b,
				record: {
					isbn13: id.isbn13,
					isbn10: b.isbn10,
					title: b.title,
					contributors: b.authors?.map((name) => ({ name, role: 'author' as const })),
					publisher: b.publisher,
					publishedDate: b.date_published,
					publishedYear: yearFrom(b.date_published),
					pageCount: b.pages || undefined,
					language: normLanguage(b.language),
					format: formatFrom(b.binding),
					editionStatement: b.edition,
					description: b.synopsis?.replace(/<[^>]+>/g, '').trim(),
					coverUrls: b.image ? [b.image] : []
				}
			};
		}
	};
}
