import { describe, expect, it } from 'vitest';
import { keyBetween } from './order.ts';

describe('keyBetween', () => {
	it('orders appends, prepends and inserts', () => {
		const a = keyBetween(null, null);
		const b = keyBetween(a, null);
		const c = keyBetween(b, null);
		const first = keyBetween(null, a);
		const mid = keyBetween(a, b);
		expect([first, a, mid, b, c]).toEqual([first, a, mid, b, c].slice().sort());
	});

	it('survives many inserts at the same spot', () => {
		let lo = keyBetween(null, null);
		const hi = keyBetween(lo, null);
		const keys = [lo, hi];
		for (let i = 0; i < 200; i++) {
			const k = keyBetween(lo, hi);
			expect(k > lo && k < hi).toBe(true);
			keys.push(k);
			lo = k;
		}
		expect(new Set(keys).size).toBe(keys.length);
		expect(Math.max(...keys.map((k) => k.length))).toBeLessThan(60);
	});

	it('random moves keep a total order', () => {
		let list = [keyBetween(null, null)];
		for (let i = 0; i < 300; i++) {
			const at = Math.floor(Math.random() * (list.length + 1));
			list.splice(at, 0, keyBetween(list[at - 1], list[at]));
		}
		expect(list).toEqual([...list].sort());
		expect(new Set(list).size).toBe(list.length);
	});
});
