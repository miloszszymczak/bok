/**
 * ISBN / ISSN / EAN helpers. All functions are pure and accept loosely formatted input
 * (spaces, hyphens, lowercase x).
 */

export type Identifier =
	| { kind: 'isbn'; isbn13: string; isbn10: string | null }
	| { kind: 'issn'; issn: string; issue: string | null }
	| { kind: 'ean'; ean: string };

const clean = (raw: string) => raw.replace(/[\s\-‐‑–—.]/g, '').toUpperCase();

export function isValidIsbn10(code: string): boolean {
	if (!/^\d{9}[\dX]$/.test(code)) return false;
	let sum = 0;
	for (let i = 0; i < 10; i++) {
		const c = code[i]!;
		sum += (c === 'X' ? 10 : Number(c)) * (10 - i);
	}
	return sum % 11 === 0;
}

function ean13CheckDigit(first12: string): number {
	let sum = 0;
	for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
	return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
	return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function isbn10To13(isbn10: string): string {
	const base = '978' + isbn10.slice(0, 9);
	return base + ean13CheckDigit(base);
}

export function isbn13To10(isbn13: string): string | null {
	if (!isbn13.startsWith('978')) return null; // 979 ranges have no ISBN-10
	const core = isbn13.slice(3, 12);
	let sum = 0;
	for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
	const check = (11 - (sum % 11)) % 11;
	return core + (check === 10 ? 'X' : String(check));
}

export function isValidIssn(code: string): boolean {
	if (!/^\d{7}[\dX]$/.test(code)) return false;
	let sum = 0;
	for (let i = 0; i < 7; i++) sum += Number(code[i]) * (8 - i);
	const check = (11 - (sum % 11)) % 11;
	return code[7] === (check === 10 ? 'X' : String(check));
}

export const formatIssn = (issn: string) => `${issn.slice(0, 4)}-${issn.slice(4)}`;

/** Derive the ISSN from a 977 EAN-13 (977 + 7 ISSN digits + 2 variant digits + check). */
export function issnFromEan(ean: string): string {
	const core = ean.slice(3, 10);
	let sum = 0;
	for (let i = 0; i < 7; i++) sum += Number(core[i]) * (8 - i);
	const check = (11 - (sum % 11)) % 11;
	return core + (check === 10 ? 'X' : String(check));
}

/**
 * Parse anything a scanner or a human might produce. `addon` is the optional EAN-2/EAN-5
 * supplement; for periodicals the EAN-2 add-on is the issue number.
 */
export function parseIdentifier(raw: string, addon?: string): Identifier | null {
	const code = clean(raw);

	if (code.length === 13 && isValidEan13(code)) {
		if (code.startsWith('978') || code.startsWith('979')) {
			return { kind: 'isbn', isbn13: code, isbn10: isbn13To10(code) };
		}
		if (code.startsWith('977')) {
			return { kind: 'issn', issn: issnFromEan(code), issue: addon && /^\d{2}$/.test(addon) ? addon : null };
		}
		return { kind: 'ean', ean: code };
	}
	if (code.length === 10 && isValidIsbn10(code)) {
		return { kind: 'isbn', isbn13: isbn10To13(code), isbn10: code };
	}
	if (code.length === 8 && isValidIssn(code)) {
		return { kind: 'issn', issn: code, issue: null };
	}
	return null;
}

/** Registration group prefix used to route lookups to national agencies. */
export function isbnGroup(isbn13: string): 'pl' | 'de' | 'en' | 'fr' | 'other' {
	if (isbn13.startsWith('9798')) return 'en';
	if (!isbn13.startsWith('978')) return 'other';
	const g = isbn13.slice(3);
	if (g.startsWith('83')) return 'pl';
	if (g.startsWith('0') || g.startsWith('1')) return 'en';
	if (g.startsWith('2')) return 'fr';
	if (g.startsWith('3')) return 'de';
	return 'other';
}
