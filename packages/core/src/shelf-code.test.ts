import { describe, expect, it } from 'vitest';
import { code128, looksLikeOurShelfCode, newShelfCode, normalizeShelfCode } from './shelf-code.ts';

describe('shelf codes', () => {
	it('normalizes labels and refuses book identifiers', () => {
		expect(normalizeShelfCode('  bok-7k2qxm ')).toBe('BOK-7K2QXM');
		expect(normalizeShelfCode('Regał A/3')).toBeNull(); // not ASCII
		expect(normalizeShelfCode('ab')).toBeNull();
		expect(normalizeShelfCode('9788375780635')).toBeNull(); // ISBN
		expect(normalizeShelfCode('9771234567003')).toBeNull(); // ISSN
		expect(normalizeShelfCode('5901234123457')).toBe('5901234123457'); // a product EAN sticker is fine
		expect(normalizeShelfCode('SHELF-12')).toBe('SHELF-12');
	});
	it('generates BOK codes from an unambiguous alphabet', () => {
		const c = newShelfCode(() => new Uint8Array([0, 1, 18, 21, 24, 31]));
		expect(c).toBe('BOK-01JNRZ');
		expect(looksLikeOurShelfCode(c)).toBe(true);
		for (let i = 0; i < 50; i++) expect(newShelfCode()).toMatch(/^BOK-[0-9A-HJKMNP-TV-Z]{6}$/);
	});
	it('encodes Code 128 B with the right checksum and structure', () => {
		const m = code128('BOK-01JNRZ');
		// start + 10 chars + check = 12 symbols of 11 modules, stop = 13 modules
		expect(m.reduce((a, b) => a + b, 0)).toBe(12 * 11 + 13);
		expect(m.slice(0, 6).join('')).toBe('211214'); // start B
		expect(m.slice(-7).join('')).toBe('2331112'); // stop
		// "PJJ123C": (104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7) mod 103 = 55 → pattern 311321
		const w = code128('PJJ123C');
		expect(w.slice(8 * 6, 9 * 6).join('')).toBe('311321');
		expect(() => code128('ż')).toThrow();
	});
});
