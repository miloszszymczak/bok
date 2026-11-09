import { computeStats } from '@bok/core';
import type { Services } from '@bok/server';
import { m } from '#lib/paraglide/messages.js';
import { imageData, ogVersion, renderYear } from './og.ts';

const books = (n: number, locale: 'en' | 'pl') => {
	const rule = new Intl.PluralRules(locale).select(n);
	return rule === 'one' ? m.books_one({ n }, { locale }) : rule === 'few' ? m.books_few({ n }, { locale }) : m.books_many({ n }, { locale });
};

/** Year-in-review card from what everyone may see (public reads only), in the owner's language. */
export async function yearPreview(svc: Services, owner: { userId: string; displayName: string; locale: string }, year: number) {
	const locale: 'en' | 'pl' = owner.locale === 'pl' ? 'pl' : 'en';
	const s = computeStats(await svc.reading.statReads(owner.userId, null), year);
	const picks = [...s.topRated, ...[]].slice(0, 5);
	const title = m.year_og_title({ year }, { locale });
	const line = `${books(s.books, locale)} · ${m.year_og_pages({ n: s.pages.toLocaleString(locale) }, { locale })}`;
	const v = ogVersion([owner.displayName, year, line, locale, ...picks.map((p) => p.coverKey ?? p.coverSrc ?? p.title)]);
	return {
		v,
		books: s.books,
		key: `og/y/${owner.userId}-${year}-${v}.png`,
		render: async () =>
			renderYear({
				name: owner.displayName,
				title,
				line,
				covers: await Promise.all(picks.map(async (p) => ({ title: p.title, data: await imageData(svc.storage, { key: p.coverKey ? `${p.coverKey}-m.webp` : null, src: p.coverSrc }) })))
			})
	};
}
