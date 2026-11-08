import { describe, expect, it } from 'vitest';
import { ScanFilter } from './filter.ts';

describe('ScanFilter', () => {
	it('needs two matching reads', () => {
		const f = new ScanFilter();
		expect(f.push('A', 0)).toBeNull();
		expect(f.push('A', 100)).toBe('A');
	});

	it('ignores a single misread between good reads', () => {
		const f = new ScanFilter();
		expect(f.push('A', 0)).toBeNull();
		expect(f.push('B', 50)).toBeNull();
		expect(f.push('B', 100)).toBe('B');
	});

	it('does not double-add while the book stays in view', () => {
		const f = new ScanFilter();
		f.push('A', 0);
		expect(f.push('A', 100)).toBe('A');
		for (let t = 200; t < 10_000; t += 150) expect(f.push('A', t)).toBeNull();
	});

	it('counts the same code again after it left the view', () => {
		const f = new ScanFilter();
		f.push('A', 0);
		f.push('A', 100);
		expect(f.push('A', 2000)).toBeNull(); // first read after a gap only starts confirmation
		expect(f.push('A', 2100)).toBe('A');
	});

	it('requires confirmations within the window', () => {
		const f = new ScanFilter();
		f.push('A', 0);
		expect(f.push('A', 1000)).toBeNull();
		expect(f.push('A', 1100)).toBe('A');
	});

	it('forget allows an immediate rescan', () => {
		const f = new ScanFilter();
		f.push('A', 0);
		f.push('A', 100);
		f.forget('A');
		f.push('A', 200);
		expect(f.push('A', 300)).toBe('A');
	});

	it('handles a fast shelf sweep of different books', () => {
		const f = new ScanFilter();
		const out: string[] = [];
		let t = 0;
		for (const code of ['A', 'B', 'C', 'D']) {
			for (let i = 0; i < 4; i++) {
				const r = f.push(code, (t += 120));
				if (r) out.push(r);
			}
		}
		expect(out).toEqual(['A', 'B', 'C', 'D']);
	});
});
