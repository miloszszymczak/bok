import { describe, expect, it } from 'vitest';
import { computeStats, reviewYear, type StatRead } from './stats.ts';

const r = (o: Partial<StatRead>): StatRead => ({ workId: o.title ?? 'w', title: 'T', authors: ['A'], tags: [], outcome: 'finished', finishedOn: null, precision: 'day', pages: null, format: 'paper', rating: null, pace: null, days: null, ...o });

describe('reading stats', () => {
	const reads = [
		r({ title: 'Long', authors: ['Lem'], finishedOn: '2026-03-02', pages: 900, rating: 10, pace: 'slow', days: 40, tags: ['sf'] }),
		r({ title: 'Short', authors: ['Lem'], finishedOn: '2026-03-20', pages: 120, rating: 6, pace: 'intensive', days: 2, tags: ['sf', 'classic'] }),
		r({ title: 'Audio', authors: ['Tokarczuk'], finishedOn: '2026-07-01', format: 'audiobook', pages: 500, rating: 8 }),
		r({ title: 'YearOnly', finishedOn: '2026-01-01', precision: 'year', pages: 300 }),
		r({ title: 'Old', finishedOn: '2025-05-05', pages: 200 }),
		r({ title: 'Undated', finishedOn: null, pages: 50 }),
		r({ title: 'Dropped', outcome: 'dnf', finishedOn: '2026-04-01' })
	];

	it('summarises one year', () => {
		const s = computeStats(reads, 2026);
		expect(s.books).toBe(4);
		expect(s.pages).toBe(900 + 120 + 300); // audiobooks don't count pages
		expect(s.dnf).toBe(1);
		expect(s.avgRating).toBe(4); // (10 + 6 + 8) / 3 / 2
		expect(s.perMonth[2]).toEqual({ books: 2, pages: 1020 });
		expect(s.perMonth[0]!.books).toBe(0); // year-only date isn't put in January
		expect(s.bestMonth).toBe(2);
		expect(s.ratings[9]).toBe(1);
		expect(s.avgDays).toBe(21);
		expect(s.pace).toEqual({ intensive: 1, usual: 0, slow: 1, unknown: 2 });
		expect(s.formats).toEqual({ paper: 3, ebook: 0, audiobook: 1 });
		expect(s.topAuthors[0]).toEqual({ name: 'Lem', count: 2 });
		expect(s.topTags[0]).toEqual({ name: 'sf', count: 2 });
		expect(s.longest!.title).toBe('Long');
		expect(s.shortest!.title).toBe('Short');
		expect(s.fastest!.title).toBe('Short');
		expect(s.topRated.map((x) => x.title)).toEqual(['Long', 'Audio', 'Short']);
	});

	it('summarises all time with a per-year breakdown', () => {
		const s = computeStats(reads);
		expect(s.books).toBe(6);
		expect(s.perYear).toEqual([{ year: 2025, books: 1, pages: 200 }, { year: 2026, books: 4, pages: 1320 }]);
		expect(s.bestMonth).toBeNull();
	});

	it('offers the year in review from 15 December to January', () => {
		expect(reviewYear(new Date('2026-12-14T12:00:00Z'))).toBeNull();
		expect(reviewYear(new Date('2026-12-15T12:00:00Z'))).toBe(2026);
		expect(reviewYear(new Date('2027-01-31T12:00:00Z'))).toBe(2026);
		expect(reviewYear(new Date('2027-02-01T12:00:00Z'))).toBeNull();
	});
});
