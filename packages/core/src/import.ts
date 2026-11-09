/**
 * Library import/export files: Goodreads CSV and the Goodreads-style CSVs that lubimyczytac
 * community exporters produce (Polish headers / shelf names, ratings 1–10).
 */
import { parseIdentifier } from './isbn.ts';
import { foldText } from './text.ts';

export type ImportSource = 'goodreads' | 'lubimyczytac' | 'generic';
export type ImportShelf = 'read' | 'reading' | 'want_to_read' | 'dnf';

export interface ParsedRow {
	line: number;
	title: string;
	authors: string[];
	isbn13: string | null;
	/** As in the file (scale decided later). */
	rating: number | null;
	shelf: ImportShelf | null;
	/** Custom shelves (not the status ones). */
	shelves: string[];
	dateRead: string | null;
	dateAdded: string | null;
	readCount: number;
	review: string;
	spoiler: boolean;
	owned: number;
	publisher: string | null;
	pages: number | null;
	year: number | null;
}

export const IMPORT_MAX_ROWS = 20_000;

/** RFC 4180 CSV (quotes, doubled quotes, CR/LF), BOM stripped, `,` / `;` / tab detected. */
export function parseCsv(text: string): string[][] {
	const src = text.replace(/^﻿/, '');
	const firstLine = src.slice(0, src.search(/\r?\n|$/));
	const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i]!;
		if (quoted) {
			if (c === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
		} else if (c === '"' && field === '') quoted = true;
		else if (c === delim) {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && src[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += c;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
	const cell = (v: string | number | null | undefined) => {
		const s = v === null || v === undefined ? '' : String(v);
		return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Header aliases (folded): Goodreads first, then Polish exporter variants.
const COLUMNS = {
	title: ['title', 'tytul', 'tytul ksiazki'],
	author: ['author', 'autor', 'autorzy', 'author l-f'],
	additional: ['additional authors', 'wspolautorzy'],
	isbn13: ['isbn13', 'isbn 13'],
	isbn: ['isbn', 'isbn10'],
	rating: ['my rating', 'rating', 'moja ocena', 'ocena'],
	shelf: ['exclusive shelf', 'polka', 'status'],
	shelves: ['bookshelves', 'polki', 'polki uzytkownika', 'tags'],
	dateRead: ['date read', 'data przeczytania', 'przeczytano'],
	dateAdded: ['date added', 'data dodania'],
	readCount: ['read count', 'liczba przeczytan'],
	review: ['my review', 'review', 'recenzja', 'opinia'],
	spoiler: ['spoiler'],
	owned: ['owned copies', 'posiadam'],
	publisher: ['publisher', 'wydawnictwo', 'wydawca'],
	pages: ['number of pages', 'liczba stron', 'strony'],
	year: ['year published', 'rok wydania'],
	originalYear: ['original publication year', 'data pierwszego wydania']
} as const;

const SHELF_WORDS: Record<string, ImportShelf> = {
	read: 'read',
	przeczytane: 'read',
	przeczytana: 'read',
	'currently-reading': 'reading',
	'currently reading': 'reading',
	'teraz czytam': 'reading',
	czytam: 'reading',
	'to-read': 'want_to_read',
	'to read': 'want_to_read',
	'chce przeczytac': 'want_to_read',
	'want to read': 'want_to_read',
	'did-not-finish': 'dnf',
	dnf: 'dnf',
	abandoned: 'dnf',
	porzucone: 'dnf',
	porzucona: 'dnf'
};
export const shelfOf = (s: string): ImportShelf | null => SHELF_WORDS[foldText(s)] ?? null;

/** `="9780547928227"` (Goodreads' Excel guard), spaces and dashes → a valid ISBN-13 or null. */
export function cleanIsbn(v: string | undefined): string | null {
	if (!v) return null;
	const s = v.replace(/^="?|"$/g, '').replace(/[\s-]/g, '');
	if (!s) return null;
	const id = parseIdentifier(s);
	return id?.kind === 'isbn' ? id.isbn13 : null;
}

/** 2023/05/14, 2023-05-14, 14.05.2023, 2023-05 or 2023 → ISO day (first of month/year). */
export function cleanDate(v: string | undefined): string | null {
	const s = (v ?? '').trim();
	let m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(s);
	if (!m) {
		const d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
		if (d) m = [d[0], d[3]!, d[2]!, d[1]!] as unknown as RegExpExecArray;
	}
	if (m) {
		const iso = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
		const t = Date.parse(iso + 'T00:00:00Z');
		return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso ? null : iso;
	}
	return null;
}

const int = (v: string | undefined) => {
	const n = Number.parseInt((v ?? '').replace(/[^\d-]/g, ''), 10);
	return Number.isFinite(n) ? n : null;
};
const num = (v: string | undefined) => {
	const n = Number.parseFloat((v ?? '').replace(',', '.'));
	return Number.isFinite(n) ? n : null;
};

export interface ParsedFile {
	source: ImportSource;
	ratingScale: 5 | 10;
	rows: ParsedRow[];
	/** Header names we didn't recognise a title column in, etc. */
	error?: 'no_title_column' | 'empty' | 'too_many_rows';
}

export function parseImportFile(text: string): ParsedFile {
	const table = parseCsv(text);
	if (table.length < 2) return { source: 'generic', ratingScale: 5, rows: [], error: 'empty' };
	if (table.length - 1 > IMPORT_MAX_ROWS) return { source: 'generic', ratingScale: 5, rows: [], error: 'too_many_rows' };
	const header = table[0]!.map((h) => foldText(h).replace(/\s+/g, ' ').trim());
	const col = (k: keyof typeof COLUMNS) => {
		for (const alias of COLUMNS[k]) {
			const i = header.indexOf(alias);
			if (i >= 0) return i;
		}
		return -1;
	};
	const idx = Object.fromEntries(Object.keys(COLUMNS).map((k) => [k, col(k as keyof typeof COLUMNS)])) as Record<keyof typeof COLUMNS, number>;
	if (idx.title < 0) return { source: 'generic', ratingScale: 5, rows: [], error: 'no_title_column' };
	const polishHeaders = header.some((h) => ['tytul', 'autor', 'ocena', 'moja ocena', 'polka', 'polki', 'data przeczytania'].includes(h));
	const get = (r: string[], k: keyof typeof COLUMNS) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');

	const rows: ParsedRow[] = [];
	table.slice(1).forEach((r, i) => {
		const title = get(r, 'title');
		if (!title) return;
		let author = get(r, 'author');
		if (idx.author === header.indexOf('author l-f') && author.includes(',')) author = author.split(',').reverse().map((s) => s.trim()).join(' ');
		const authors = [author, ...get(r, 'additional').split(/[,;]/)].map((a) => a.trim()).filter(Boolean);
		const shelfRaw = get(r, 'shelf');
		const all = get(r, 'shelves')
			.split(/[,;]/)
			.map((s) => s.replace(/\s*\(#\d+\)$/, '').trim())
			.filter(Boolean);
		const shelf = shelfOf(shelfRaw) ?? all.map(shelfOf).find(Boolean) ?? null;
		const rating = num(get(r, 'rating'));
		const dateRead = cleanDate(get(r, 'dateRead'));
		rows.push({
			line: i + 2,
			title,
			authors: [...new Set(authors)],
			isbn13: cleanIsbn(get(r, 'isbn13')) ?? cleanIsbn(get(r, 'isbn')),
			rating: rating && rating > 0 ? rating : null,
			shelf: shelf ?? (dateRead ? 'read' : null),
			shelves: [...new Set(all.filter((s) => !shelfOf(s) && foldText(s) !== foldText(shelfRaw)))],
			dateRead,
			dateAdded: cleanDate(get(r, 'dateAdded')),
			readCount: Math.max(0, int(get(r, 'readCount')) ?? 0),
			review: get(r, 'review').replace(/<br\s*\/?>/gi, '\n').slice(0, 20_000),
			spoiler: /^(true|yes|1|tak)$/i.test(get(r, 'spoiler')),
			owned: Math.max(0, int(get(r, 'owned')) ?? 0),
			publisher: get(r, 'publisher') || null,
			pages: int(get(r, 'pages')),
			year: int(get(r, 'year')) ?? int(get(r, 'originalYear'))
		});
	});
	const isGoodreads = header.includes('book id') && header.includes('exclusive shelf');
	const polishShelves = rows.filter((r) => r.shelf).length > 0 && table.slice(1).some((r) => ['przeczytane', 'teraz czytam', 'chce przeczytac', 'porzucone'].includes(foldText(get(r, 'shelf'))));
	const source: ImportSource = polishHeaders || polishShelves ? 'lubimyczytac' : isGoodreads ? 'goodreads' : 'generic';
	return { source, ratingScale: detectScale(rows, source), rows };
}

/** Ratings above 5 (or half-stars like 7.5) mean a 1–10 scale; lubimyczytac exports are 1–10. */
export function detectScale(rows: Pick<ParsedRow, 'rating'>[], source: ImportSource): 5 | 10 {
	const rated = rows.map((r) => r.rating).filter((x): x is number => x !== null);
	if (rated.some((x) => x > 5)) return 10;
	if (source === 'lubimyczytac' && rated.length && !rated.every((x) => Number.isInteger(x) && x <= 5)) return 10;
	return source === 'lubimyczytac' && rated.length === 0 ? 10 : 5;
}

/** Our ratings are 1–10 (half stars). */
export function toRating(raw: number | null, scale: 5 | 10): number | null {
	if (raw === null || raw <= 0) return null;
	return Math.max(1, Math.min(10, Math.round(scale === 5 ? raw * 2 : raw)));
}

export function summarize(rows: ParsedRow[]) {
	const by = (s: ImportShelf | null) => rows.filter((r) => r.shelf === s).length;
	const shelves = new Map<string, number>();
	for (const r of rows) for (const s of r.shelves) shelves.set(s, (shelves.get(s) ?? 0) + 1);
	return {
		total: rows.length,
		withIsbn: rows.filter((r) => r.isbn13).length,
		read: by('read'),
		reading: by('reading'),
		wantToRead: by('want_to_read'),
		dnf: by('dnf'),
		noShelf: by(null),
		rated: rows.filter((r) => r.rating !== null).length,
		reviews: rows.filter((r) => r.review).length,
		owned: rows.filter((r) => r.owned > 0).length,
		shelves: [...shelves.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, count]) => ({ name, count }))
	};
}

export const GOODREADS_HEADER = [
	'Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors', 'ISBN', 'ISBN13', 'My Rating', 'Average Rating', 'Publisher', 'Binding',
	'Number of Pages', 'Year Published', 'Original Publication Year', 'Date Read', 'Date Added', 'Bookshelves', 'Bookshelves with positions',
	'Exclusive Shelf', 'My Review', 'Spoiler', 'Private Notes', 'Read Count', 'Owned Copies'
];
