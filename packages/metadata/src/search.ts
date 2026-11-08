import { isValidEan13, isbn10To13, isValidIsbn10 } from '@bok/core';

export interface RemoteSearchHit {
	title: string;
	authors: string[];
	year?: number;
	isbn13: string;
	coverUrl?: string;
	source: 'openlibrary';
}

/** Title/author search on Open Library; every hit carries an ISBN so it can be looked up properly. */
export async function searchOpenLibrary(q: string, opts: { limit?: number; signal?: AbortSignal; userAgent?: string; lang?: string } = {}): Promise<RemoteSearchHit[]> {
	const url = new URL('https://openlibrary.org/search.json');
	url.searchParams.set('q', q);
	url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,isbn,language');
	url.searchParams.set('limit', String(opts.limit ?? 8));
	const res = await fetch(url, { signal: opts.signal ?? AbortSignal.timeout(3000), headers: { 'user-agent': opts.userAgent ?? 'bok/0.1' } });
	if (!res.ok) return [];
	const body = (await res.json()) as {
		docs: { title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; isbn?: string[] }[];
	};
	const hits: RemoteSearchHit[] = [];
	for (const d of body.docs) {
		const isbn = (d.isbn ?? [])
			.map((i) => (i.length === 10 && isValidIsbn10(i) ? isbn10To13(i) : i))
			.find((i) => i.length === 13 && isValidEan13(i));
		if (!isbn) continue;
		hits.push({
			title: d.title,
			authors: d.author_name?.slice(0, 3) ?? [],
			year: d.first_publish_year,
			isbn13: isbn,
			coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
			source: 'openlibrary'
		});
	}
	return hits;
}
