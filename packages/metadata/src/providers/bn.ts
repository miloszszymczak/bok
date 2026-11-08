import { isbn13To10, type Identifier } from '@bok/core';
import { invertName } from '@bok/core';
import type { BookRecord, Contributor, ContributorRole, Provider } from '../types.ts';
import { formatFrom } from './openlibrary.ts';
import { getJson, normLanguage, pagesFrom, trimPunct, yearFrom } from '../util.ts';

/** National Library of Poland — https://data.bn.org.pl/docs/bibs */

type Subfield = Record<string, string>;
type MarcField = Record<string, string | { ind1: string; ind2: string; subfields: Subfield[] }>;
interface BnBib {
	id: number;
	kind?: string;
	isbnIssn?: string;
	marc: { leader: string; fields: MarcField[] };
}
interface BnResponse {
	bibs: BnBib[];
}

class Marc {
	constructor(private readonly fields: MarcField[]) {}
	all(tag: string): Subfield[][] {
		const out: Subfield[][] = [];
		for (const f of this.fields) {
			const v = f[tag];
			if (v && typeof v === 'object') out.push(v.subfields);
		}
		return out;
	}
	control(tag: string): string | undefined {
		for (const f of this.fields) if (typeof f[tag] === 'string') return f[tag] as string;
		return undefined;
	}
	static get(sf: Subfield[], code: string): string | undefined {
		for (const s of sf) if (code in s) return s[code];
		return undefined;
	}
	static getAll(sf: Subfield[], code: string): string[] {
		return sf.filter((s) => code in s).map((s) => s[code]!);
	}
}

const ROLE_MAP: [RegExp, ContributorRole][] = [
	[/autor/i, 'author'],
	[/tłum|przekł/i, 'translator'],
	[/ilustr/i, 'illustrator'],
	[/red(akc|\.)|oprac/i, 'editor'],
	[/lektor|czyta/i, 'narrator']
];

const digits = (s: string | undefined) => (s ?? '').replace(/[^\dX]/gi, '').toUpperCase();

export function matchesIdentifier(m: Marc, id: Identifier): boolean {
	if (id.kind === 'isbn') {
		const wanted = new Set([id.isbn13, id.isbn10 ?? isbn13To10(id.isbn13)].filter(Boolean));
		return m.all('020').some((sf) => wanted.has(digits(Marc.get(sf, 'a'))));
	}
	if (id.kind === 'issn') return m.all('022').some((sf) => digits(Marc.get(sf, 'a')) === id.issn);
	return false;
}

export function parseBnBib(bib: BnBib, id: Identifier): BookRecord {
	const m = new Marc(bib.marc.fields);
	const t245 = m.all('245')[0] ?? [];
	const titleParts = [Marc.get(t245, 'a'), Marc.get(t245, 'n'), Marc.get(t245, 'p')].map(trimPunct).filter(Boolean);

	const contributors: Contributor[] = [];
	const seen = new Set<string>();
	const addPerson = (sf: Subfield[], fallback: ContributorRole | null) => {
		if (Marc.get(sf, 't')) return; // analytic entry (contained work), not a contributor of this edition
		const raw = trimPunct(Marc.get(sf, 'a'));
		if (!raw) return;
		const relators = Marc.getAll(sf, 'e').join(' ');
		const role = ROLE_MAP.find(([re]) => re.test(relators))?.[1] ?? fallback;
		if (!role) return;
		const name = invertName(raw);
		const key = `${name}|${role}`;
		if (seen.has(key)) return;
		seen.add(key);
		contributors.push({ name, role });
	};
	for (const sf of m.all('100')) addPerson(sf, 'author');
	for (const sf of m.all('700')) addPerson(sf, null);

	const pub = m.all('264').find(() => true) ?? m.all('260')[0] ?? [];
	const lang041 = m.all('041')[0];
	const f008 = m.control('008');
	const original = m.all('246').find((sf) => /oryg/i.test(Marc.get(sf, 'i') ?? ''));
	const series = m.all('490')[0];
	const isbnField = m.all('020').find((sf) => {
		const d = digits(Marc.get(sf, 'a'));
		return id.kind === 'isbn' && (d === id.isbn13 || d === id.isbn10);
	});

	return {
		isbn13: id.kind === 'isbn' ? id.isbn13 : undefined,
		isbn10: id.kind === 'isbn' ? (id.isbn10 ?? undefined) : undefined,
		issn: id.kind === 'issn' ? id.issn : undefined,
		title: titleParts.join('. ') || undefined,
		subtitle: trimPunct(Marc.get(t245, 'b')),
		contributors,
		publisher: trimPunct(Marc.get(pub, 'b')),
		publishedDate: trimPunct(Marc.get(pub, 'c'))?.replace(/^copyright\s*/i, ''),
		publishedYear: yearFrom(Marc.get(pub, 'c')),
		pageCount: pagesFrom(Marc.get(m.all('300')[0] ?? [], 'a')),
		language: normLanguage((lang041 && Marc.get(lang041, 'a')) ?? f008?.slice(35, 38)),
		originalLanguage: normLanguage(lang041 && Marc.get(lang041, 'h')),
		originalTitle: original ? trimPunct(Marc.get(original, 'a')) : undefined,
		firstPublishedYear: yearFrom(original ? Marc.get(original, 'f') : undefined),
		format: formatFrom(isbnField ? Marc.getAll(isbnField, 'q').join(' ') : undefined),
		editionStatement: trimPunct(Marc.get(m.all('250')[0] ?? [], 'a')),
		series: series
			? {
					name: trimPunct(Marc.get(series, 'a')?.split(' / ')[0]) ?? '',
					position: trimPunct(Marc.get(series, 'v'))
				}
			: undefined,
		externalId: String(bib.id)
	};
}

export const bn: Provider = {
	name: 'bn',
	supports: (id) => id.kind === 'isbn' || id.kind === 'issn',
	async lookup(id, ctx) {
		const q = id.kind === 'isbn' ? id.isbn13 : id.kind === 'issn' ? `${id.issn.slice(0, 4)}-${id.issn.slice(4)}` : null;
		if (!q) return null;
		const res = await getJson<BnResponse>(`https://data.bn.org.pl/api/institutions/bibs.json?isbnIssn=${q}&limit=20`, ctx);
		const bib = res?.bibs.find((b) => matchesIdentifier(new Marc(b.marc.fields), id));
		if (!bib) return null;
		const record = parseBnBib(bib, id);
		if (record.series && !record.series.name) delete record.series;
		return record.title ? { record, raw: bib } : null;
	}
};
