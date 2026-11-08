/**
 * Bookcase layout maths shared by the designer (browser) and the server.
 * Columns run left → right; each column has shelves top → bottom.
 * Column widths sum to `width`; every column's shelf heights sum to `height` (cm).
 */
export interface Layout {
	width: number;
	height: number;
	columns: { w: number; shelves: number[] }[];
}

export interface Cell {
	col: number;
	row: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

export const LIMITS = { maxColumns: 12, maxShelves: 20, minWidth: 20, maxWidth: 1200, minHeight: 20, maxHeight: 400, minColumn: 8, minShelf: 6 } as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Split `total` into `n` parts that sum exactly to `total` (1 decimal place). */
export function evenSplit(total: number, n: number): number[] {
	const part = round1(total / n);
	const parts = Array.from({ length: n }, () => part);
	parts[n - 1] = round1(total - part * (n - 1));
	return parts;
}

export function defaultLayout(columns: number, shelves: number, size: { width?: number; height?: number } = {}): Layout {
	const cols = clampInt(columns, 1, LIMITS.maxColumns);
	const rows = clampInt(shelves, 1, LIMITS.maxShelves);
	const width = size.width ?? Math.min(80 * cols, LIMITS.maxWidth);
	const height = size.height ?? 200;
	return { width, height, columns: evenSplit(width, cols).map((w) => ({ w, shelves: evenSplit(height, rows) })) };
}

function clampInt(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : min)));
}

/** Rescale `parts` so they sum to `total`, keeping proportions (and a minimum each). */
function fit(parts: number[], total: number, min: number): number[] {
	const clean = parts.map((p) => (Number.isFinite(p) && p > 0 ? p : min));
	const sum = clean.reduce((a, b) => a + b, 0);
	const scaled = clean.map((p) => Math.max(min, round1((p / sum) * total)));
	const drift = round1(total - scaled.reduce((a, b) => a + b, 0));
	const last = scaled.length - 1;
	scaled[last] = round1(scaled[last]! + drift);
	return scaled;
}

/** Validate untrusted input (from the designer / API) into a consistent layout. Throws on garbage. */
export function normalizeLayout(input: unknown): Layout {
	const l = input as Partial<Layout> | null;
	if (!l || !Array.isArray(l.columns) || l.columns.length === 0) throw new Error('layout needs at least one column');
	if (l.columns.length > LIMITS.maxColumns) throw new Error('too many columns');
	const width = Math.max(LIMITS.minWidth, Math.min(LIMITS.maxWidth, Number(l.width) || 80));
	const height = Math.max(LIMITS.minHeight, Math.min(LIMITS.maxHeight, Number(l.height) || 200));
	const widths = fit(
		l.columns.map((c) => Number(c?.w)),
		width,
		Math.min(LIMITS.minColumn, width / l.columns.length)
	);
	const columns = l.columns.map((c, i) => {
		const shelves = Array.isArray(c?.shelves) && c.shelves.length ? c.shelves.slice(0, LIMITS.maxShelves).map(Number) : [height];
		return { w: widths[i]!, shelves: fit(shelves, height, Math.min(LIMITS.minShelf, height / shelves.length)) };
	});
	return { width, height, columns };
}

export function cellsOf(layout: Layout): Cell[] {
	const cells: Cell[] = [];
	let x = 0;
	layout.columns.forEach((c, col) => {
		let y = 0;
		c.shelves.forEach((h, row) => {
			cells.push({ col, row, x: round1(x), y: round1(y), w: c.w, h });
			y += h;
		});
		x += c.w;
	});
	return cells;
}

/** A, B … Z, AA, AB … for columns; shelves numbered from the top. */
export function autoLabel(col: number, row: number): string {
	let n = col;
	let letters = '';
	do {
		letters = String.fromCharCode(65 + (n % 26)) + letters;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return `${letters}${row + 1}`;
}

/** Order used by "Next shelf": down each column, then the next column. */
export function compareCells(a: { col: number; row: number }, b: { col: number; row: number }) {
	return a.col - b.col || a.row - b.row;
}

/** Move the boundary between column `i` and `i+1` by `delta` cm, respecting minimum widths. */
export function moveColumnDivider(layout: Layout, i: number, delta: number): Layout {
	const cols = layout.columns.map((c) => ({ ...c, shelves: [...c.shelves] }));
	const a = cols[i], b = cols[i + 1];
	if (!a || !b) return layout;
	const d = Math.max(LIMITS.minColumn - a.w, Math.min(b.w - LIMITS.minColumn, delta));
	a.w = round1(a.w + d);
	b.w = round1(b.w - d);
	return { ...layout, columns: cols };
}

/** Move the boundary between shelf `j` and `j+1` of column `col` by `delta` cm. */
export function moveShelfDivider(layout: Layout, col: number, j: number, delta: number): Layout {
	const cols = layout.columns.map((c) => ({ ...c, shelves: [...c.shelves] }));
	const s = cols[col]?.shelves;
	if (!s || s[j] === undefined || s[j + 1] === undefined) return layout;
	const d = Math.max(LIMITS.minShelf - s[j]!, Math.min(s[j + 1]! - LIMITS.minShelf, delta));
	s[j] = round1(s[j]! + d);
	s[j + 1] = round1(s[j + 1]! - d);
	return { ...layout, columns: cols };
}

/** Change the number of shelves in a column; adding splits the tallest shelf, removing merges the last two. */
export function setShelfCount(layout: Layout, col: number, count: number): Layout {
	const cols = layout.columns.map((c) => ({ ...c, shelves: [...c.shelves] }));
	const s = cols[col]?.shelves;
	if (!s) return layout;
	const target = clampInt(count, 1, LIMITS.maxShelves);
	while (s.length < target) {
		const i = s.indexOf(Math.max(...s));
		const half = round1(s[i]! / 2);
		s.splice(i, 1, half, round1(s[i]! - half));
	}
	while (s.length > target) {
		const last = s.pop()!;
		s[s.length - 1] = round1(s[s.length - 1]! + last);
	}
	return { ...layout, columns: cols };
}

export function setColumnCount(layout: Layout, count: number): Layout {
	const target = clampInt(count, 1, LIMITS.maxColumns);
	const cols = layout.columns.map((c) => ({ ...c, shelves: [...c.shelves] }));
	while (cols.length < target) cols.push({ w: cols[cols.length - 1]!.w, shelves: [...cols[cols.length - 1]!.shelves] });
	cols.length = target;
	return normalizeLayout({ ...layout, columns: cols });
}

export function evenOut(layout: Layout): Layout {
	return {
		...layout,
		columns: evenSplit(layout.width, layout.columns.length).map((w, i) => ({ w, shelves: evenSplit(layout.height, layout.columns[i]!.shelves.length) }))
	};
}

export function resize(layout: Layout, width: number, height: number): Layout {
	return normalizeLayout({ ...layout, width, height });
}
