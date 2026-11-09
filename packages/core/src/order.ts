/**
 * Fractional ordering keys: a string strictly between two others, so moving an item rewrites
 * only that item. Keys use base-62 digits and never end in the lowest digit.
 * (Same idea as figma/fractional-indexing, without the integer part.)
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function midpoint(a: string, b: string | null): string {
	if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
	if (a.endsWith('0') || (b && b.endsWith('0'))) throw new Error('trailing zero');
	if (b !== null) {
		let n = 0;
		while ((a[n] ?? '0') === b[n]) n++;
		if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
	}
	const da = a ? DIGITS.indexOf(a[0]!) : 0;
	const db = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
	if (db - da > 1) return DIGITS[Math.round((da + db) / 2)]!;
	if (b && b.length > 1) return b.slice(0, 1);
	return DIGITS[da]! + midpoint(a.slice(1), null);
}

/** Key strictly between `before` (or the start) and `after` (or the end). */
export function keyBetween(before: string | null | undefined, after: string | null | undefined): string {
	return midpoint(before ?? '', after ?? null);
}
