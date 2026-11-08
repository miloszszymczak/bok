import { describe, expect, it } from 'vitest';
import { isbn10To13, isbn13To10, isbnGroup, parseIdentifier, isValidIssn } from './isbn.ts';
import { foldText, invertName } from './text.ts';
import { uuidv7 } from './uuid.ts';

describe('isbn', () => {
	it('parses ISBN-13 with hyphens', () => {
		expect(parseIdentifier('978-83-7578-063-5')).toEqual({ kind: 'isbn', isbn13: '9788375780635', isbn10: '8375780634' });
	});
	it('parses ISBN-10 with X', () => {
		expect(parseIdentifier('0-8044-2957-X')).toMatchObject({ kind: 'isbn', isbn13: '9780804429573' });
	});
	it('rejects a bad checksum', () => {
		expect(parseIdentifier('9788375780636')).toBeNull();
	});
	it('converts both ways', () => {
		expect(isbn10To13('054792822X')).toBe('9780547928227');
		expect(isbn13To10('9780547928227')).toBe('054792822X');
		expect(isbn13To10('9798886450231')).toBeNull();
	});
	it('reads ISSN from a 977 barcode with issue add-on', () => {
		// Nature: ISSN 0028-0836 → EAN 9770028083002
		expect(parseIdentifier('9770028083002', '05')).toEqual({ kind: 'issn', issn: '00280836', issue: '05' });
		expect(isValidIssn('00280836')).toBe(true);
	});
	it('routes registration groups', () => {
		expect(isbnGroup('9788375780635')).toBe('pl');
		expect(isbnGroup('9783161484100')).toBe('de');
		expect(isbnGroup('9780547928227')).toBe('en');
	});
});

describe('text', () => {
	it('folds Polish diacritics', () => {
		expect(foldText('Żółć Łódź')).toBe('zolc lodz');
	});
	it('inverts catalogue names', () => {
		expect(invertName('Sapkowski, Andrzej')).toBe('Andrzej Sapkowski');
	});
});

describe('uuidv7', () => {
	it('is version 7 and sortable', () => {
		const a = uuidv7(1000);
		const b = uuidv7(2000);
		expect(a[14]).toBe('7');
		expect(a < b).toBe(true);
	});
});
