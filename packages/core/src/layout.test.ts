import { describe, expect, it } from 'vitest';
import { autoLabel, cellsOf, compareCells, defaultLayout, moveColumnDivider, moveShelfDivider, normalizeLayout, setColumnCount, setShelfCount } from './layout.ts';

const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 10) / 10;

describe('layout', () => {
	it('builds an even default and keeps sums exact', () => {
		const l = defaultLayout(3, 6, { width: 200, height: 202 });
		expect(sum(l.columns.map((c) => c.w))).toBe(200);
		for (const c of l.columns) expect(sum(c.shelves)).toBe(202);
		expect(cellsOf(l)).toHaveLength(18);
	});

	it('labels columns with letters and shelves from the top', () => {
		expect([autoLabel(0, 0), autoLabel(1, 3), autoLabel(25, 0), autoLabel(26, 1)]).toEqual(['A1', 'B4', 'Z1', 'AA2']);
	});

	it('moves dividers within limits', () => {
		const l = defaultLayout(2, 3, { width: 160, height: 180 });
		const a = moveColumnDivider(l, 0, 30);
		expect(a.columns.map((c) => c.w)).toEqual([110, 50]);
		expect(moveColumnDivider(l, 0, 500).columns[1]!.w).toBe(8); // clamped to the minimum
		const b = moveShelfDivider(l, 1, 0, -20);
		expect(b.columns[1]!.shelves).toEqual([40, 80, 60]);
		expect(sum(b.columns[1]!.shelves)).toBe(180);
	});

	it('changes shelf and column counts', () => {
		let l = defaultLayout(1, 2, { width: 80, height: 200 });
		l = setShelfCount(l, 0, 4);
		expect(l.columns[0]!.shelves).toHaveLength(4);
		expect(sum(l.columns[0]!.shelves)).toBe(200);
		l = setShelfCount(l, 0, 1);
		expect(l.columns[0]!.shelves).toEqual([200]);
		l = setColumnCount(l, 5);
		expect(l.columns).toHaveLength(5);
		expect(sum(l.columns.map((c) => c.w))).toBe(80);
	});

	it('normalizes untrusted input', () => {
		const l = normalizeLayout({ width: 99999, height: -4, columns: [{ w: 1, shelves: [1, 1] }, { w: 3, shelves: 'x' }] });
		expect(l.width).toBe(1200);
		expect(l.height).toBe(20);
		expect(sum(l.columns.map((c) => c.w))).toBe(1200);
		expect(l.columns[1]!.shelves).toEqual([20]);
		expect(() => normalizeLayout({ columns: [] })).toThrow();
	});

	it('orders cells down each column', () => {
		const cells = cellsOf(defaultLayout(2, 2)).sort(compareCells);
		expect(cells.map((c) => autoLabel(c.col, c.row))).toEqual(['A1', 'A2', 'B1', 'B2']);
	});
});
