import { describe, expect, it } from 'vitest';
import { cleanDate, cleanIsbn, detectScale, parseCsv, parseImportFile, summarize, toCsv, toRating, GOODREADS_HEADER } from './import.ts';

const GR = `Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies
5907,"The Hobbit, or There and Back Again",J.R.R. Tolkien,"Tolkien, J.R.R.",,"=""054792822X""","=""9780547928227""",5,4.29,Mariner Books,Paperback,300,2012,1937,2023/05/14,2022/01/03,"fantasy, classics","fantasy (#3), classics (#1)",read,"Loved it.<br/>Again!",,,2,1
1,"Ostatnie życzenie",Andrzej Sapkowski,"Sapkowski, Andrzej",,"=""""","=""""",0,4.3,SuperNowa,,332,2014,1993,,2024/02/01,to-read,to-read (#1),to-read,,,,0,0
2,"Bez ISBN",Ktoś,"Ktoś",,"=""""","=""""",3,3,,,,,,,,currently-reading,,currently-reading,,,,1,0
`;

describe('import files', () => {
	it('parses CSV with quotes, doubled quotes, newlines and semicolons', () => {
		expect(parseCsv('a,b\r\n"x, ""y""","line1\nline2"\n')).toEqual([['a', 'b'], ['x, "y"', 'line1\nline2']]);
		expect(parseCsv('﻿Tytuł;Autor\nA;B\n')).toEqual([['Tytuł', 'Autor'], ['A', 'B']]);
		expect(parseCsv(toCsv([['a,b', 'c"d', null, 3]]))).toEqual([['a,b', 'c"d', '', '3']]);
	});

	it('cleans ISBNs and dates', () => {
		expect(cleanIsbn('="9780547928227"')).toBe('9780547928227');
		expect(cleanIsbn('="054792822X"')).toBe('9780547928227');
		expect(cleanIsbn('=""')).toBeNull();
		expect(cleanIsbn('978-83-7578-063-5')).toBe('9788375780635');
		expect(cleanDate('2023/05/14')).toBe('2023-05-14');
		expect(cleanDate('14.05.2023')).toBe('2023-05-14');
		expect(cleanDate('2023/02/30')).toBeNull();
		expect(cleanDate('')).toBeNull();
	});

	it('reads a Goodreads export', () => {
		const f = parseImportFile(GR);
		expect(f.source).toBe('goodreads');
		expect(f.ratingScale).toBe(5);
		expect(f.rows).toHaveLength(3);
		const [h, s, x] = f.rows;
		expect(h).toMatchObject({ line: 2, title: 'The Hobbit, or There and Back Again', authors: ['J.R.R. Tolkien'], isbn13: '9780547928227', rating: 5, shelf: 'read', shelves: ['fantasy', 'classics'], dateRead: '2023-05-14', readCount: 2, owned: 1, pages: 300, year: 2012 });
		expect(h!.review).toBe('Loved it.\nAgain!');
		expect(s).toMatchObject({ isbn13: null, rating: null, shelf: 'want_to_read', shelves: [] });
		expect(x).toMatchObject({ shelf: 'reading', authors: ['Ktoś'] });
		expect(summarize(f.rows)).toMatchObject({ total: 3, withIsbn: 1, read: 1, reading: 1, wantToRead: 1, shelves: [{ name: 'fantasy', count: 1 }, { name: 'classics', count: 1 }] });
	});

	it('reads a lubimyczytac-style export with Polish headers and a 1–10 scale', () => {
		const f = parseImportFile('Tytuł;Autor;ISBN;Moja ocena;Półka;Data przeczytania;Półki\n"Wiedźmin";Andrzej Sapkowski;9788375780635;8;Przeczytane;2021-03-02;fantastyka\nSolaris;Stanisław Lem;;4;Porzucone;;\n');
		expect(f.source).toBe('lubimyczytac');
		expect(f.ratingScale).toBe(10);
		expect(f.rows[0]).toMatchObject({ title: 'Wiedźmin', rating: 8, shelf: 'read', dateRead: '2021-03-02', shelves: ['fantastyka'] });
		expect(f.rows[1]).toMatchObject({ shelf: 'dnf' });
		expect(toRating(8, f.ratingScale)).toBe(8);
	});

	it('detects the rating scale', () => {
		expect(detectScale([{ rating: 4 }, { rating: 5 }], 'goodreads')).toBe(5);
		expect(detectScale([{ rating: 4 }, { rating: 7 }], 'goodreads')).toBe(10);
		expect(detectScale([{ rating: 7.5 }], 'lubimyczytac')).toBe(10);
		expect(toRating(3, 5)).toBe(6);
		expect(toRating(0, 5)).toBeNull();
		expect(toRating(12, 10)).toBe(10);
	});

	it('rejects files without a title column', () => {
		expect(parseImportFile('foo,bar\n1,2\n').error).toBe('no_title_column');
		expect(parseImportFile('').error).toBe('empty');
		expect(GOODREADS_HEADER).toContain('Exclusive Shelf');
	});
});
