/** Reading-log maths shared by server and browser. Dates are ISO strings (YYYY-MM-DD) or Dates. */

export type Precision = 'day' | 'month' | 'year';
export type Pace = 'intensive' | 'usual' | 'slow';

const DAY = 86_400_000;
const toUtcDay = (d: Date | string) => {
	const x = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
	return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

/** Calendar days between start and finish (same day counts as 1). Null when either is unknown or out of order. */
export function estimateDays(started: Date | string | null | undefined, finished: Date | string | null | undefined): number | null {
	if (!started || !finished) return null;
	const diff = Math.round((toUtcDay(finished) - toUtcDay(started)) / DAY);
	if (diff < 0) return null;
	return Math.max(1, diff);
}

/** Pace from pages per day relative to the reader's own median (defaults to 30 pages/day). */
export function suggestPace(pages: number | null | undefined, days: number | null | undefined, medianPagesPerDay?: number | null): Pace | null {
	if (!pages || !days) return null;
	const rate = pages / days;
	const median = medianPagesPerDay && medianPagesPerDay > 0 ? medianPagesPerDay : 30;
	if (rate >= median * 1.5) return 'intensive';
	if (rate <= median / 1.5) return 'slow';
	return 'usual';
}

export function median(values: number[]): number | null {
	const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
	if (!v.length) return null;
	const mid = Math.floor(v.length / 2);
	return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export interface LogEntryLike {
	finishedOn: string | null;
	finishedPrecision: Precision | null;
}

export interface LogGroup<T> {
	/** Null for the "Past" bag (no date at all). */
	year: number | null;
	months: { month: number | null; entries: T[] }[]; // month null = "sometime that year"
}

/**
 * Letterboxd-style diary: year → month, newest first. Year-only dates go to the year's
 * "sometime" bucket (after its months); reads without any date go to a final "Past" group.
 */
export function groupLog<T extends LogEntryLike>(entries: T[]): LogGroup<T>[] {
	const years = new Map<number, Map<number | null, T[]>>();
	const past: T[] = [];
	for (const e of entries) {
		if (!e.finishedOn || !e.finishedPrecision) {
			past.push(e);
			continue;
		}
		const y = Number(e.finishedOn.slice(0, 4));
		const mo = e.finishedPrecision === 'year' ? null : Number(e.finishedOn.slice(5, 7));
		const ym = years.get(y) ?? new Map<number | null, T[]>();
		const list = ym.get(mo) ?? [];
		list.push(e);
		ym.set(mo, list);
		years.set(y, ym);
	}
	const byDateDesc = (a: T, b: T) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? '');
	const groups: LogGroup<T>[] = [...years.entries()]
		.sort(([a], [b]) => b - a)
		.map(([year, ms]) => ({
			year,
			months: [...ms.entries()]
				.sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
				.map(([month, list]) => ({ month, entries: list.sort(byDateDesc) }))
		}));
	if (past.length) groups.push({ year: null, months: [{ month: null, entries: past }] });
	return groups;
}

/** Normalise a finish date to the first day of its period ('2026-03' → '2026-03-01'). */
export function normalizeFinish(value: string | null | undefined, precision: Precision | null | undefined): { date: string | null; precision: Precision | null } {
	if (!value || !precision) return { date: null, precision: null };
	const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value.trim());
	if (!m) return { date: null, precision: null };
	const [, y, mo, d] = m;
	if (precision === 'year') return { date: `${y}-01-01`, precision };
	if (precision === 'month') return mo ? { date: `${y}-${mo}-01`, precision } : { date: `${y}-01-01`, precision: 'year' };
	return mo && d ? { date: `${y}-${mo}-${d}`, precision } : { date: null, precision: null };
}

export interface GoalProgress {
	target: number;
	done: number;
	/** Books you "should" have read by today to finish on time. */
	expected: number;
	/** Positive = ahead, negative = behind (whole books). */
	diff: number;
	percent: number;
}

export function goalProgress(target: number, done: number, today: Date): GoalProgress {
	const y = today.getUTCFullYear();
	const start = Date.UTC(y, 0, 1);
	const days = (Date.UTC(y + 1, 0, 1) - start) / DAY;
	const elapsed = (toUtcDay(today) - start) / DAY + 1;
	const expected = (target * elapsed) / days;
	return { target, done, expected: Math.round(expected * 10) / 10, diff: Math.round(done - expected) || 0, percent: target ? Math.min(100, Math.round((done / target) * 100)) : 0 };
}

/** 0–10 rating → stars (5 max, halves). */
export const ratingStars = (r: number) => r / 2;
