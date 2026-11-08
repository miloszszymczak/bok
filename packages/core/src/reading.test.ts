import { describe, expect, it } from 'vitest';
import { estimateDays, goalProgress, groupLog, median, normalizeFinish, suggestPace } from './reading.ts';

describe('reading maths', () => {
	it('estimates calendar days', () => {
		expect(estimateDays('2026-03-01', '2026-03-15')).toBe(14);
		expect(estimateDays(new Date('2026-03-01T22:00:00Z'), '2026-03-01')).toBe(1);
		expect(estimateDays('2026-03-15', '2026-03-01')).toBeNull();
		expect(estimateDays(null, '2026-03-01')).toBeNull();
	});

	it('suggests pace against the reader median', () => {
		expect(suggestPace(300, 3, 30)).toBe('intensive');
		expect(suggestPace(300, 10, 30)).toBe('usual');
		expect(suggestPace(300, 30, 30)).toBe('slow');
		expect(suggestPace(300, 10, null)).toBe('usual');
		expect(suggestPace(null, 10, 30)).toBeNull();
		expect(median([5, 1, 3])).toBe(3);
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});

	it('normalizes finish dates', () => {
		expect(normalizeFinish('2026-03', 'month')).toEqual({ date: '2026-03-01', precision: 'month' });
		expect(normalizeFinish('2026-03-17', 'year')).toEqual({ date: '2026-01-01', precision: 'year' });
		expect(normalizeFinish('2026', 'day')).toEqual({ date: null, precision: null });
		expect(normalizeFinish(null, 'day')).toEqual({ date: null, precision: null });
	});

	it('groups the diary: months, sometime-that-year, then Past', () => {
		const e = (finishedOn: string | null, finishedPrecision: 'day' | 'month' | 'year' | null, id: string) => ({ finishedOn, finishedPrecision, id });
		const groups = groupLog([
			e('2026-03-05', 'day', 'a'),
			e(null, null, 'past'),
			e('2026-03-20', 'day', 'b'),
			e('2026-01-01', 'year', 'y'),
			e('2026-07-01', 'month', 'm'),
			e('2025-12-31', 'day', 'old')
		]);
		expect(groups.map((g) => g.year)).toEqual([2026, 2025, null]);
		expect(groups[0]!.months.map((m) => [m.month, m.entries.map((x) => x.id)])).toEqual([
			[7, ['m']],
			[3, ['b', 'a']],
			[null, ['y']]
		]);
		expect(groups[2]!.months[0]!.entries.map((x) => x.id)).toEqual(['past']);
	});

	it('tracks the yearly goal', () => {
		const mid = new Date('2026-07-02T12:00:00Z'); // day 183 of 365
		expect(goalProgress(24, 12, mid)).toMatchObject({ diff: 0, percent: 50 });
		expect(goalProgress(24, 9, mid).diff).toBe(-3);
		expect(goalProgress(24, 15, mid).diff).toBe(3);
	});
});
