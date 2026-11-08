import type { ProviderContext } from './types.ts';

export async function getJson<T>(url: string, ctx: ProviderContext, headers: Record<string, string> = {}): Promise<T | null> {
	const res = await ctx.fetch(url, {
		signal: ctx.signal,
		headers: { 'user-agent': ctx.userAgent, accept: 'application/json', ...headers }
	});
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
	return (await res.json()) as T;
}

/** Strip ISBD punctuation that catalogues leave at the end of fields ("Title /", "Warszawa :"). */
export function trimPunct(s: string | undefined | null): string | undefined {
	if (!s) return undefined;
	const out = s
		.replace(/\s*[/:;,=]\s*$/, '')
		.replace(/(?<![A-Z\p{Lu}])\.$/u, '') // drop a trailing period unless it ends an initial
		.replace(/^\[|\]$/g, '')
		.trim();
	return out || undefined;
}

export function yearFrom(s: string | undefined | null): number | undefined {
	const m = s ? /(1[5-9]\d\d|20\d\d)/.exec(s) : null;
	return m ? Number(m[1]) : undefined;
}

export function pagesFrom(s: string | undefined | null): number | undefined {
	const m = s ? /(\d{1,5})/.exec(s) : null;
	const n = m ? Number(m[1]) : NaN;
	return n > 0 && n < 20000 ? n : undefined;
}

const ISO_639_2: Record<string, string> = {
	pol: 'pl', eng: 'en', ger: 'de', deu: 'de', fre: 'fr', fra: 'fr', spa: 'es', ita: 'it', rus: 'ru',
	ukr: 'uk', cze: 'cs', ces: 'cs', slo: 'sk', slk: 'sk', por: 'pt', dut: 'nl', nld: 'nl', swe: 'sv',
	nor: 'no', dan: 'da', fin: 'fi', jpn: 'ja', chi: 'zh', zho: 'zh', lit: 'lt', hun: 'hu', lat: 'la'
};
const POLISH_NAMES: Record<string, string> = { polski: 'pl', angielski: 'en', niemiecki: 'de', francuski: 'fr' };

export function normLanguage(code: string | undefined | null): string | undefined {
	if (!code) return undefined;
	const c = code.trim().toLowerCase().replace(/^\/languages\//, '');
	if (c.length === 2) return c;
	return ISO_639_2[c] ?? POLISH_NAMES[c] ?? c;
}
