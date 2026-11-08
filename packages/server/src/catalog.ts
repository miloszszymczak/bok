import { foldText, parseIdentifier, sortName, type Identifier } from '@bok/core';
import {
	authors,
	editionContributors,
	editionSources,
	editions,
	workAuthors,
	works,
	type Db
} from '@bok/db';
import type { BookRecord, LookupResult, MetadataClient } from '@bok/metadata';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Kv } from './valkey.ts';
import { lookupOutcomes } from './metrics.ts';
import { log } from './log.ts';
import { linkSeries } from './tagging.ts';
import { QUEUES, type Queue } from './queue.ts';

export type LookupOutcome =
	| { status: 'found'; source: 'db' | 'providers'; editionId: string; workId: string; result?: LookupResult }
	| { status: 'not_found'; cached: boolean; result?: LookupResult }
	| { status: 'invalid' };

const MISS_TTL = 7 * 24 * 3600;
const MISS_TTL_DEGRADED = 3600; // some provider errored — retry sooner

const idKey = (id: Identifier) => (id.kind === 'isbn' ? id.isbn13 : id.kind === 'issn' ? `issn:${id.issn}` : `ean:${id.ean}`);

export interface CatalogDeps {
	db: Db;
	kv: Kv;
	metadata: MetadataClient;
	queue: Queue;
}

export function createCatalog(deps: CatalogDeps) {
	const { db, kv, metadata, queue } = deps;
	const inflight = new Map<string, Promise<LookupOutcome>>();

	async function findEdition(id: Identifier) {
		if (id.kind === 'isbn') {
			return db.query.editions.findFirst({ where: eq(editions.isbn13, id.isbn13), columns: { id: true, workId: true } });
		}
		if (id.kind === 'issn') {
			return db.query.editions.findFirst({
				where: and(eq(editions.issn, id.issn), isNull(editions.isbn13)),
				columns: { id: true, workId: true }
			});
		}
		return undefined;
	}

	async function lookup(raw: string, opts: { refresh?: boolean; userId?: string; keepResult?: boolean } = {}): Promise<LookupOutcome> {
		const id = parseIdentifier(raw);
		if (!id) {
			lookupOutcomes.inc({ source: 'invalid' });
			return { status: 'invalid' };
		}
		const key = idKey(id);
		const pending = inflight.get(key);
		if (pending && !opts.refresh) return pending;

		const p = (async (): Promise<LookupOutcome> => {
			if (!opts.refresh) {
				const existing = await findEdition(id);
				if (existing) {
					lookupOutcomes.inc({ source: 'db' });
					return { status: 'found', source: 'db', editionId: existing.id, workId: existing.workId };
				}
				if (await kv.get(`meta:miss:${key}`)) {
					lookupOutcomes.inc({ source: 'miss_cached' });
					return { status: 'not_found', cached: true };
				}
			}
			const result = await metadata.lookup(id);
			if (!result.merged?.title) {
				const degraded = result.results.some((r) => r.status === 'error' || r.status === 'timeout');
				await kv.set(`meta:miss:${key}`, '1', 'EX', degraded ? MISS_TTL_DEGRADED : MISS_TTL);
				lookupOutcomes.inc({ source: 'miss' });
				return { status: 'not_found', cached: false, result: opts.keepResult ? result : undefined };
			}
			const saved = await persist(id, result, opts.userId);
			await kv.del(`meta:miss:${key}`);
			lookupOutcomes.inc({ source: 'providers' });
			return { status: 'found', source: 'providers', ...saved, result: opts.keepResult ? result : undefined };
		})();

		inflight.set(key, p);
		try {
			return await p;
		} finally {
			inflight.delete(key);
		}
	}

	/** Write (or refresh) work, authors and edition from a merged lookup in one transaction. */
	async function persist(id: Identifier | null, result: Pick<LookupResult, 'merged' | 'quality' | 'results'>, userId?: string) {
		const rec = result.merged as BookRecord;
		const saved = await db.transaction(async (tx) => {
			const people = rec.contributors ?? [];
			const authorIds = new Map<string, string>(); // folded name → id
			if (people.length) {
				const folded = [...new Set(people.map((p) => foldText(p.name)))];
				const found = await tx.select({ id: authors.id, folded: authors.folded }).from(authors).where(inArray(authors.folded, folded));
				for (const a of found) authorIds.set(a.folded, a.id);
				for (const p of people) {
					const f = foldText(p.name);
					if (authorIds.has(f)) continue;
					const [row] = await tx
						.insert(authors)
						.values({ name: p.name, sortName: sortName(p.name), folded: f })
						.returning({ id: authors.id });
					authorIds.set(f, row!.id);
				}
			}
			const mainAuthors = people.filter((p) => p.role === 'author');
			const mainAuthorIds = [...new Set(mainAuthors.map((p) => authorIds.get(foldText(p.name))!))];

			// Existing edition (refresh) keeps its work.
			// Manual records (id === null) always create a new edition.
			const existing = !id
				? undefined
				: await (id.kind === 'isbn'
						? tx.query.editions.findFirst({ where: eq(editions.isbn13, id.isbn13) })
						: tx.query.editions.findFirst({ where: and(eq(editions.issn, (id as { issn: string }).issn), isNull(editions.isbn13)) }));

			const workId = existing?.workId ?? (await findOrCreateWork(tx, rec, mainAuthorIds));

			const values = {
				workId,
				isbn13: id?.kind === 'isbn' ? id.isbn13 : null,
				isbn10: id?.kind === 'isbn' ? id.isbn10 : null,
				issn: id?.kind === 'issn' ? id.issn : (rec.issn ?? null),
				title: rec.title!,
				subtitle: rec.subtitle ?? null,
				publisher: rec.publisher ?? null,
				publishedDate: rec.publishedDate ?? null,
				publishedYear: rec.publishedYear ?? null,
				pageCount: rec.pageCount ?? null,
				language: rec.language ?? null,
				format: rec.format ?? null,
				editionStatement: rec.editionStatement ?? null,
				seriesName: rec.series?.name ?? null,
				seriesPosition: rec.series?.position ?? null,
				description: rec.description ?? null,
				coverSourceUrl: rec.coverUrls?.[0] ?? null,
				metadataQuality: result.quality,
				metadataFetchedAt: new Date()
			};
			let editionId: string;
			let needsCover = false;
			if (existing) {
				editionId = existing.id;
				await tx.update(editions).set(values).where(eq(editions.id, editionId));
				needsCover = existing.coverStatus !== 'ready' && !!rec.coverUrls?.length;
			} else {
				const [row] = await tx
					.insert(editions)
					.values({ ...values, createdBy: userId ?? null, coverStatus: rec.coverUrls?.length ? 'pending' : 'none' })
					.returning({ id: editions.id });
				editionId = row!.id;
				needsCover = !!rec.coverUrls?.length;
			}

			await tx.delete(editionContributors).where(eq(editionContributors.editionId, editionId));
			const contribRows = people
				.map((p, i) => ({ editionId, authorId: authorIds.get(foldText(p.name))!, role: p.role, position: i }))
				.filter((r, i, arr) => arr.findIndex((x) => x.authorId === r.authorId && x.role === r.role) === i);
			if (contribRows.length) await tx.insert(editionContributors).values(contribRows);

			for (const r of result.results) {
				if (r.status !== 'hit') continue;
				await tx
					.insert(editionSources)
					.values({ editionId, provider: r.provider, externalId: r.record?.externalId ?? null, raw: r.raw ?? {} })
					.onConflictDoUpdate({
						target: [editionSources.editionId, editionSources.provider],
						set: { raw: r.raw ?? {}, externalId: r.record?.externalId ?? null, fetchedAt: new Date() }
					});
			}
			if (rec.series?.name) await linkSeries(tx, workId, rec.series.name, rec.series.position);
			await refreshWorkSearch(tx, workId);
			return { editionId, workId, needsCover };
		});
		if (saved.needsCover) {
			await queue
				.send(QUEUES.coverMirror, { editionId: saved.editionId }, { singletonKey: saved.editionId })
				.catch((e) => log.error({ err: e, editionId: saved.editionId }, 'failed to enqueue cover job'));
		}
		return { editionId: saved.editionId, workId: saved.workId };
	}

	type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

	async function findOrCreateWork(tx: Tx, rec: BookRecord, authorIds: string[]): Promise<string> {
		if (rec.olWorkKey) {
			const w = await tx.query.works.findFirst({ where: eq(works.olKey, rec.olWorkKey), columns: { id: true } });
			if (w) return w.id;
		}
		// Same author + same (original) title → same work, across translations.
		const titles = [...new Set([rec.title, rec.originalTitle].filter((t): t is string => !!t).map(foldText))];
		if (authorIds.length && titles.length) {
			const rows = await tx.execute<{ id: string }>(sql`
				select w.id from works w
				join work_authors wa on wa.work_id = w.id
				where wa.author_id in (${sql.join(authorIds.map((a) => sql`${a}::uuid`), sql`, `)})
				  and (w.folded_title in (${sql.join(titles.map((t) => sql`${t}`), sql`, `)})
				    or w.folded_original_title in (${sql.join(titles.map((t) => sql`${t}`), sql`, `)}))
				limit 1`);
			const hit = rows[0];
			if (hit) {
				if (rec.olWorkKey) await tx.update(works).set({ olKey: rec.olWorkKey }).where(and(eq(works.id, hit.id), isNull(works.olKey)));
				return hit.id;
			}
		}
		const [w] = await tx
			.insert(works)
			.values({
				title: rec.title!,
				subtitle: rec.subtitle ?? null,
				foldedTitle: foldText(rec.title!),
				originalTitle: rec.originalTitle ?? null,
				foldedOriginalTitle: rec.originalTitle ? foldText(rec.originalTitle) : null,
				originalLanguage: rec.originalLanguage ?? null,
				firstPublishedYear: rec.firstPublishedYear ?? rec.publishedYear ?? null,
				description: rec.description ?? null,
				olKey: rec.olWorkKey ?? null
			})
			.returning({ id: works.id });
		if (authorIds.length) {
			await tx.insert(workAuthors).values(authorIds.map((authorId, position) => ({ workId: w!.id, authorId, position })));
		}
		return w!.id;
	}

	async function refreshWorkSearch(tx: Tx | Db, workId: string) {
		await tx.execute(sql`
			update works w set search_text = (
				select concat_ws(' ', w.folded_title, w.folded_original_title,
					(select string_agg(a.folded, ' ') from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = w.id),
					(select string_agg(distinct coalesce(e.isbn13, ''), ' ') from editions e where e.work_id = w.id))
			) where w.id = ${workId}`);
	}

	/** Trigram search over works; `q` is folded first so "zolc" finds "Żółć". */
	async function search(q: string, limit = 20) {
		const folded = foldText(q);
		if (folded.length < 2) return [];
		const rows = await db.execute<{
			id: string;
			title: string;
			subtitle: string | null;
			first_published_year: number | null;
			authors: string[] | null;
			edition_id: string | null;
			cover_key: string | null;
			cover_source_url: string | null;
			score: number;
		}>(sql`
			select w.id, w.title, w.subtitle, w.first_published_year,
				(select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = w.id) as authors,
				e.id as edition_id, e.cover_key, e.cover_source_url,
				word_similarity(${folded}, w.search_text) as score
			from works w
			left join lateral (
				select id, cover_key, cover_source_url from editions where work_id = w.id
				order by (cover_status = 'ready') desc, metadata_quality desc limit 1
			) e on true
			where ${folded} <% w.search_text or w.search_text like ${'%' + folded.replace(/[%_]/g, '') + '%'}
			order by score desc, w.title
			limit ${limit}`);
		return [...rows];
	}

	return { lookup, persist, search, findEdition, refreshWorkSearch };
}

export type Catalog = ReturnType<typeof createCatalog>;
