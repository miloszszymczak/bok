import type { Services } from '@bok/server';
import { m } from '#lib/paraglide/messages.js';
import { imageData, ogVersion, renderList } from './og.ts';

type Summary = NonNullable<Awaited<ReturnType<Services['readlists']['bySlug']>>>['list'];

const plural = (n: number, locale: 'en' | 'pl') => {
	const rule = new Intl.PluralRules(locale).select(n);
	return rule === 'one' ? m.books_one({ n }, { locale }) : rule === 'few' ? m.books_few({ n }, { locale }) : m.books_many({ n }, { locale });
};

/** Cache key + renderer for a list's preview card, in the owner's language. */
export async function listPreview(svc: Services, list: Summary) {
	const owner = await svc.accounts.getProfile(list.ownerId);
	const locale: 'en' | 'pl' = owner?.locale === 'pl' ? 'pl' : 'en';
	const v = ogVersion([list.title, list.ownerName, list.count, locale, ...list.covers.map((c) => c.key ?? c.src ?? c.title)]);
	return {
		v,
		key: `og/l/${list.id}-${v}.png`,
		render: async () =>
			renderList({
				title: list.title,
				owner: list.ownerName,
				countLabel: plural(list.count, locale),
				covers: await Promise.all(list.covers.map(async (c) => ({ title: c.title, data: await imageData(svc.storage, { key: c.key ? `${c.key}-m.webp` : null, src: c.src }) })))
			})
	};
}
