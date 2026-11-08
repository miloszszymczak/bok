import { isbnGroup, type Identifier } from '@bok/core';
import { mergeRecords, qualityScore } from './merge.ts';
import { bn } from './providers/bn.ts';
import { crossref } from './providers/crossref.ts';
import { googleBooks } from './providers/googlebooks.ts';
import { isbndb } from './providers/isbndb.ts';
import { openLibrary } from './providers/openlibrary.ts';
import type { LookupResult, Provider, ProviderName, ProviderResult } from './types.ts';

export interface LookupConfig {
	googleBooksApiKey?: string;
	isbndbApiKey?: string;
	timeoutMs?: number;
	userAgent?: string;
	fetch?: typeof fetch;
	/** Called once per provider call — wire to metrics. */
	onResult?: (r: ProviderResult, id: Identifier) => void;
}

export interface MetadataClient {
	lookup(id: Identifier, opts?: { only?: ProviderName[] }): Promise<LookupResult>;
	providers: ProviderName[];
}

export function createMetadataClient(cfg: LookupConfig = {}): MetadataClient {
	const all = new Map<ProviderName, Provider>();
	all.set('openlibrary', openLibrary);
	all.set('bn', bn);
	all.set('crossref', crossref);
	if (cfg.googleBooksApiKey) all.set('googlebooks', googleBooks(cfg.googleBooksApiKey));
	if (cfg.isbndbApiKey) all.set('isbndb', isbndb(cfg.isbndbApiKey));

	const timeoutMs = cfg.timeoutMs ?? 2500;
	const userAgent = cfg.userAgent ?? 'bok/0.1 (+https://bok.mwsz.org)';
	const doFetch = cfg.fetch ?? fetch;

	async function run(p: Provider, id: Identifier): Promise<ProviderResult> {
		const started = performance.now();
		const signal = AbortSignal.timeout(timeoutMs);
		let result: ProviderResult;
		try {
			const hit = await p.lookup(id, { fetch: doFetch, signal, userAgent });
			const ms = Math.round(performance.now() - started);
			result = hit ? { provider: p.name, status: 'hit', ms, record: hit.record, raw: hit.raw } : { provider: p.name, status: 'miss', ms };
		} catch (e) {
			const ms = Math.round(performance.now() - started);
			const timeout = signal.aborted || (e instanceof Error && e.name === 'TimeoutError');
			result = { provider: p.name, status: timeout ? 'timeout' : 'error', ms, error: e instanceof Error ? e.message : String(e) };
		}
		cfg.onResult?.(result, id);
		return result;
	}

	const pick = (names: ProviderName[], id: Identifier) =>
		names.map((n) => all.get(n)).filter((p): p is Provider => !!p && p.supports(id));

	return {
		providers: [...all.keys()],
		async lookup(id, opts) {
			let primary: ProviderName[];
			let fallback: ProviderName[];
			if (opts?.only) {
				primary = opts.only;
				fallback = [];
			} else if (id.kind === 'issn') {
				primary = ['bn', 'crossref'];
				fallback = [];
			} else if (id.kind === 'isbn' && isbnGroup(id.isbn13) === 'pl') {
				primary = ['bn', 'openlibrary', 'googlebooks'];
				fallback = ['isbndb'];
			} else {
				primary = ['openlibrary', 'googlebooks'];
				fallback = ['bn', 'isbndb'];
			}

			const results = await Promise.all(pick(primary, id).map((p) => run(p, id)));
			let merged = mergeRecords(results);
			const needsMore = !merged?.title || !merged.contributors?.length;
			if (needsMore && fallback.length) {
				// Fallbacks run in order, stopping as soon as title + authors are known (ISBNdb costs money).
				for (const p of pick(fallback, id)) {
					results.push(await run(p, id));
					merged = mergeRecords(results);
					if (merged?.title && merged.contributors?.length) break;
				}
			}
			return { identifier: id, merged, quality: qualityScore(merged), results };
		}
	};
}
