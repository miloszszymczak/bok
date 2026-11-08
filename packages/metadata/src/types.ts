import type { Identifier } from '@bok/core';

export type ContributorRole = 'author' | 'translator' | 'illustrator' | 'editor' | 'narrator';
export type BookFormat = 'paperback' | 'hardcover' | 'ebook' | 'audiobook' | 'other';

export interface Contributor {
	name: string;
	role: ContributorRole;
}

/** Normalised record a provider returns. Every field is optional. */
export interface BookRecord {
	isbn13?: string;
	isbn10?: string;
	issn?: string;
	title?: string;
	subtitle?: string;
	contributors?: Contributor[];
	publisher?: string;
	publishedDate?: string;
	publishedYear?: number;
	pageCount?: number;
	/** ISO 639-1 where known, otherwise the raw code. */
	language?: string;
	format?: BookFormat;
	editionStatement?: string;
	series?: { name: string; position?: string };
	description?: string;
	coverUrls?: string[];
	originalTitle?: string;
	originalLanguage?: string;
	firstPublishedYear?: number;
	subjects?: string[];
	olWorkKey?: string;
	externalId?: string;
}

export interface ProviderContext {
	fetch: typeof fetch;
	signal: AbortSignal;
	userAgent: string;
}

export interface ProviderHit {
	record: BookRecord;
	raw: unknown;
}

export interface Provider {
	readonly name: ProviderName;
	supports(id: Identifier): boolean;
	lookup(id: Identifier, ctx: ProviderContext): Promise<ProviderHit | null>;
}

export type ProviderName = 'bn' | 'openlibrary' | 'googlebooks' | 'isbndb' | 'crossref';

export type ProviderStatus = 'hit' | 'miss' | 'error' | 'timeout';

export interface ProviderResult {
	provider: ProviderName;
	status: ProviderStatus;
	ms: number;
	record?: BookRecord;
	raw?: unknown;
	error?: string;
}

export interface LookupResult {
	identifier: Identifier;
	merged: BookRecord | null;
	quality: number;
	results: ProviderResult[];
}
