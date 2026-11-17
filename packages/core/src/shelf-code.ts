import { parseIdentifier } from './isbn.ts';

/**
 * Shelf labels: a barcode stuck on a shelf. Either one we generate (BOK-XXXXXX, printed as
 * Code 128, which every USB/Bluetooth scanner and phone decoder reads) or any barcode the user
 * already has there. Book identifiers (ISBN/ISSN) are never shelf codes.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
export const SHELF_CODE_PREFIX = 'BOK-';

/** Canonical form for storing and matching: trimmed, upper case, printable ASCII only. */
export function normalizeShelfCode(raw: string): string | null {
	const code = raw.trim().toUpperCase();
	if (code.length < 3 || code.length > 40 || !/^[\x20-\x7e]+$/.test(code)) return null;
	const id = parseIdentifier(code);
	if (id && id.kind !== 'ean') return null; // that's a book
	return code;
}

export function newShelfCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
	return SHELF_CODE_PREFIX + [...random(6)].map((b) => ALPHABET[b % 32]).join('');
}

/** One of ours (printed by bok), as opposed to some other barcode. */
export const looksLikeOurShelfCode = (raw: string) => /^BOK-[0-9A-Z]{6}$/i.test(raw.trim());

// Code 128 bar/space widths for values 0–106 (106 = stop, 7 elements).
const PATTERNS = (
	'212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
	'221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
	'231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
	'314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
	'111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
	'114131 311141 411131 211412 211214 211232 2331112'
).split(' ');
const START_B = 104;
const STOP = 106;

/**
 * Code 128 (code set B) as module widths, starting with a bar and alternating bar/space,
 * without quiet zones. Supports printable ASCII.
 */
export function code128(text: string): number[] {
	if (!/^[\x20-\x7e]+$/.test(text)) throw new Error('Code 128 B: printable ASCII only');
	const values = [...text].map((c) => c.charCodeAt(0) - 32);
	const check = values.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
	return [START_B, ...values, check, STOP].flatMap((v) => [...PATTERNS[v]!].map(Number));
}
