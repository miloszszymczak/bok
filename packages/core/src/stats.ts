/** Reading statistics and the year in review, computed from a list of reads (pure). */

export interface StatRead {
	workId: string;
	title: string;
	authors: string[];
	tags: string[];
	outcome: 'finished' | 'dnf';
	/** ISO day; with precision 'month'/'year' only the leading parts count. */
	finishedOn: string | null;
	precision: 'day' | 'month' | 'year' | null;
	pages: number | null;
	format: 'paper' | 'ebook' | 'audiobook';
	rating: number | null;
	pace: 'intensive' | 'usual' | 'slow' | null;
	days: number | null;
	cover?: string | null;
	/** Raw storage key / source URL (link-preview images). */
	coverKey?: string | null;
	coverSrc?: string | null;
}

export interface ReadingStats {
	year: number | null;
	books: number;
	pages: number;
	dnf: number;
	avgRating: number | null;
	perYear: { year: number; books: number; pages: number }[];
	/** 12 months of the chosen year (books finished; reads with only a year don't count here). */
	perMonth: { books: number; pages: number }[];
	/** Index 0 = rating 1 (½★) … 9 = rating 10 (5★). */
	ratings: number[];
	avgDays: number | null;
	pace: Record<'intensive' | 'usual' | 'slow' | 'unknown', number>;
	formats: Record<'paper' | 'ebook' | 'audiobook', number>;
	topAuthors: { name: string; count: number }[];
	topTags: { name: string; count: number }[];
	longest: StatRead | null;
	shortest: StatRead | null;
	fastest: StatRead | null;
	topRated: StatRead[];
	bestMonth: number | null;
}

const yearOf = (r: StatRead) => (r.finishedOn ? Number(r.finishedOn.slice(0, 4)) : null);
const monthOf = (r: StatRead) => (r.finishedOn && r.precision !== 'year' ? Number(r.finishedOn.slice(5, 7)) - 1 : null);

function top(values: string[], n = 5) {
	const m = new Map<string, number>();
	for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
	return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));
}

export function computeStats(all: StatRead[], year: number | null = null): ReadingStats {
	const finishedAll = all.filter((r) => r.outcome === 'finished');
	const inScope = (r: StatRead) => year === null || yearOf(r) === year;
	const fin = finishedAll.filter(inScope);
	const withPages = fin.filter((r) => r.pages && r.format !== 'audiobook');
	const rated = fin.filter((r) => r.rating);
	const timed = fin.filter((r) => r.days && r.days > 0);

	const years = new Map<number, { books: number; pages: number }>();
	for (const r of finishedAll) {
		const y = yearOf(r);
		if (y === null) continue;
		const e = years.get(y) ?? { books: 0, pages: 0 };
		e.books++;
		e.pages += r.format !== 'audiobook' ? (r.pages ?? 0) : 0;
		years.set(y, e);
	}
	const perMonth = Array.from({ length: 12 }, () => ({ books: 0, pages: 0 }));
	if (year !== null)
		for (const r of fin) {
			const mo = monthOf(r);
			if (mo === null) continue;
			perMonth[mo]!.books++;
			perMonth[mo]!.pages += r.format !== 'audiobook' ? (r.pages ?? 0) : 0;
		}
	const ratings = Array.from({ length: 10 }, () => 0);
	for (const r of rated) ratings[Math.min(10, Math.max(1, r.rating!)) - 1]!++;
	const byPages = [...withPages].sort((a, b) => b.pages! - a.pages!);
	const best = perMonth.reduce((bi, m, i, arr) => (m.books > (arr[bi]?.books ?? 0) ? i : bi), 0);

	return {
		year,
		books: fin.length,
		pages: withPages.reduce((s, r) => s + r.pages!, 0),
		dnf: all.filter((r) => r.outcome === 'dnf' && inScope(r)).length,
		avgRating: rated.length ? Math.round((rated.reduce((s, r) => s + r.rating!, 0) / rated.length / 2) * 10) / 10 : null,
		perYear: [...years.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ year: y, ...v })),
		perMonth,
		ratings,
		avgDays: timed.length ? Math.round(timed.reduce((s, r) => s + r.days!, 0) / timed.length) : null,
		pace: {
			intensive: fin.filter((r) => r.pace === 'intensive').length,
			usual: fin.filter((r) => r.pace === 'usual').length,
			slow: fin.filter((r) => r.pace === 'slow').length,
			unknown: fin.filter((r) => !r.pace).length
		},
		formats: { paper: fin.filter((r) => r.format === 'paper').length, ebook: fin.filter((r) => r.format === 'ebook').length, audiobook: fin.filter((r) => r.format === 'audiobook').length },
		topAuthors: top(fin.flatMap((r) => [...new Set(r.authors.slice(0, 1))])),
		topTags: top(fin.flatMap((r) => [...new Set(r.tags)])),
		longest: byPages[0] ?? null,
		shortest: byPages.length > 1 ? byPages[byPages.length - 1]! : null,
		fastest: [...timed].sort((a, b) => a.days! - b.days!)[0] ?? null,
		topRated: [...rated].sort((a, b) => b.rating! - a.rating! || (b.finishedOn ?? '').localeCompare(a.finishedOn ?? '')).slice(0, 5),
		bestMonth: year !== null && perMonth[best]!.books > 0 ? best : null
	};
}

/** Year in review is offered from 15 December to the end of January (for the year just ending). */
export function reviewYear(today: Date): number | null {
	const m = today.getUTCMonth(), d = today.getUTCDate(), y = today.getUTCFullYear();
	if (m === 11 && d >= 15) return y;
	if (m === 0) return y - 1;
	return null;
}
