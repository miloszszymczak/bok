import { foldText, parseIdentifier, sortName } from '@bok/core';
import { authors, editionSources, editions, metadataEdits, workAuthors, works, type Db } from '@bok/db';
import type { BookFormat, BookRecord } from '@bok/metadata';
import { qualityScore } from '@bok/metadata';
import { eq, inArray } from 'drizzle-orm';
import type { Catalog } from './catalog.ts';
import type { Storage } from './storage.ts';
import { linkSeries } from './tagging.ts';

export const FORMATS: BookFormat[] = ['paperback', 'hardcover', 'ebook', 'audiobook', 'other'];

export interface ManualBook {
	title: string;
	subtitle?: string;
	authors: string[];
	publisher?: string;
	year?: number;
	pages?: number;
	language?: string;
	format?: BookFormat;
	isbn?: string;
	description?: string;
}

export interface EditionPatch {
	title?: string;
	subtitle?: string | null;
	publisher?: string | null;
	publishedYear?: number | null;
	pageCount?: number | null;
	language?: string | null;
	format?: BookFormat | null;
	editionStatement?: string | null;
	seriesName?: string | null;
	seriesPosition?: string | null;
	description?: string | null;
}

export interface WorkPatch {
	title?: string;
	originalTitle?: string | null;
	firstPublishedYear?: number | null;
	authors?: string[];
}

type Diff = Record<string, { from: unknown; to: unknown }>;

function diffOf<T extends Record<string, unknown>>(current: T, patch: Partial<T>): Diff {
	const d: Diff = {};
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined) continue;
		const before = current[k] ?? null;
		if (JSON.stringify(before) !== JSON.stringify(v)) d[k] = { from: before, to: v };
	}
	return d;
}

const IMG_SIZES = ['s', 'm', 'l'] as const;
export type CoverSet = Record<(typeof IMG_SIZES)[number], Uint8Array>;

export function isWebp(b: Uint8Array) {
	return b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
}

export function createCatalogEditor(db: Db, catalog: Catalog, storage: Storage) {
	async function ensureAuthors(names: string[]): Promise<string[]> {
		const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
		if (!clean.length) return [];
		const folded = clean.map(foldText);
		const found = await db.select({ id: authors.id, folded: authors.folded }).from(authors).where(inArray(authors.folded, folded));
		const byFold = new Map(found.map((a) => [a.folded, a.id]));
		const ids: string[] = [];
		for (const name of clean) {
			const f = foldText(name);
			let id = byFold.get(f);
			if (!id) {
				const [row] = await db.insert(authors).values({ name, sortName: sortName(name), folded: f }).returning({ id: authors.id });
				id = row!.id;
				byFold.set(f, id);
			}
			ids.push(id);
		}
		return ids;
	}

	return {
		/** Book without (findable) ISBN. If the ISBN is already catalogued, returns that edition instead. */
		async createManual(input: ManualBook, userId: string) {
			const id = input.isbn ? parseIdentifier(input.isbn) : null;
			if (id) {
				const existing = await catalog.findEdition(id);
				if (existing) return { editionId: existing.id, workId: existing.workId, existed: true };
			}
			const record: BookRecord = {
				title: input.title.trim(),
				subtitle: input.subtitle?.trim() || undefined,
				contributors: input.authors.map((name) => ({ name: name.trim(), role: 'author' as const })).filter((c) => c.name),
				publisher: input.publisher?.trim() || undefined,
				publishedYear: input.year,
				publishedDate: input.year ? String(input.year) : undefined,
				pageCount: input.pages,
				language: input.language || undefined,
				format: input.format,
				description: input.description?.trim() || undefined
			};
			const saved = await catalog.persist(id && id.kind !== 'ean' ? id : null, { merged: record, quality: qualityScore(record), results: [] }, userId);
			await db
				.insert(editionSources)
				.values({ editionId: saved.editionId, provider: 'manual', raw: { ...input, userId } })
				.onConflictDoNothing();
			return { ...saved, existed: false };
		},

		async editEdition(editionId: string, patch: EditionPatch, userId: string) {
			const current = await db.query.editions.findFirst({ where: eq(editions.id, editionId) });
			if (!current) return null;
			const diff = diffOf(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
			if (!Object.keys(diff).length) return { changed: false };
			const values = Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.to]));
			if ('publishedYear' in values) values.publishedDate = values.publishedYear ? String(values.publishedYear) : null;
			await db.transaction(async (tx) => {
				await tx.update(editions).set(values).where(eq(editions.id, editionId));
				await tx.insert(metadataEdits).values({ entity: 'edition', entityId: editionId, userId, diff });
				if ('seriesName' in diff || 'seriesPosition' in diff) {
					const name = (values.seriesName as string | null | undefined) ?? current.seriesName;
					const pos = (values.seriesPosition as string | null | undefined) ?? current.seriesPosition;
					await linkSeries(tx, current.workId, name, pos);
				}
			});
			await catalog.refreshWorkSearch(db, current.workId);
			return { changed: true };
		},

		async editWork(workId: string, patch: WorkPatch, userId: string) {
			const current = await db.query.works.findFirst({ where: eq(works.id, workId) });
			if (!current) return null;
			const { authors: names, ...fields } = patch;
			const diff = diffOf(current as unknown as Record<string, unknown>, fields as Record<string, unknown>);
			if (names) {
				const before = await db
					.select({ name: authors.name })
					.from(workAuthors)
					.innerJoin(authors, eq(authors.id, workAuthors.authorId))
					.where(eq(workAuthors.workId, workId))
					.orderBy(workAuthors.position);
				const prev = before.map((b) => b.name);
				const next = names.map((n) => n.trim()).filter(Boolean);
				if (JSON.stringify(prev) !== JSON.stringify(next)) diff.authors = { from: prev, to: next };
			}
			if (!Object.keys(diff).length) return { changed: false };
			const authorIds = diff.authors ? await ensureAuthors(diff.authors.to as string[]) : null;
			await db.transaction(async (tx) => {
				const values: Record<string, unknown> = {};
				for (const [k, v] of Object.entries(diff)) if (k !== 'authors') values[k] = v.to;
				if ('title' in values) values.foldedTitle = foldText(String(values.title));
				if ('originalTitle' in values) values.foldedOriginalTitle = values.originalTitle ? foldText(String(values.originalTitle)) : null;
				if (Object.keys(values).length) await tx.update(works).set(values).where(eq(works.id, workId));
				if (authorIds) {
					await tx.delete(workAuthors).where(eq(workAuthors.workId, workId));
					if (authorIds.length) await tx.insert(workAuthors).values(authorIds.map((authorId, position) => ({ workId, authorId, position })));
				}
				await tx.insert(metadataEdits).values({ entity: 'work', entityId: workId, userId, diff });
			});
			await catalog.refreshWorkSearch(db, workId);
			return { changed: true };
		},

		/** User photo of a cover: the browser already produced s/m/l WebP variants. */
		async setCover(editionId: string, set: CoverSet, userId: string) {
			const ed = await db.query.editions.findFirst({ where: eq(editions.id, editionId), columns: { id: true, coverKey: true } });
			if (!ed) return null;
			const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', set.l as BufferSource)).slice(0, 8), (b) =>
				b.toString(16).padStart(2, '0')
			).join('');
			const base = `covers/${editionId}/u${hash}`;
			await Promise.all(IMG_SIZES.map((s) => storage.put(`${base}-${s}.webp`, set[s], 'image/webp')));
			await db.transaction(async (tx) => {
				await tx.update(editions).set({ coverKey: base, coverStatus: 'ready', coverSourceUrl: null }).where(eq(editions.id, editionId));
				await tx.insert(metadataEdits).values({ entity: 'edition', entityId: editionId, userId, diff: { coverKey: { from: ed.coverKey, to: base } } });
			});
			return { coverKey: base };
		}
	};
}

export type CatalogEditor = ReturnType<typeof createCatalogEditor>;
