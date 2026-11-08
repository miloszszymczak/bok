import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIdentifier } from '@bok/core';
import { createMetadataClient, mergeRecords, qualityScore } from '../src/index.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** Fake fetch serving recorded responses by URL substring. */
function fakeFetch(routes: [string, string | null][]): typeof fetch {
	return (async (input: string | URL | Request) => {
		const url = String(input);
		const hit = routes.find(([k]) => url.includes(k));
		if (!hit || hit[1] === null) return new Response('not found', { status: 404 });
		return new Response(hit[1], { status: 200, headers: { 'content-type': 'application/json' } });
	}) as typeof fetch;
}

describe('lookup — Polish ISBN', () => {
	const id = parseIdentifier('9788375780635')!;
	const client = createMetadataClient({
		fetch: fakeFetch([
			['data.bn.org.pl', fixture('bn-9788375780635.json')],
			['/api/books', fixture('ol-9788375780635.json')],
			['/isbn/9788375780635.json', fixture('oli-9788375780635.json')]
		])
	});

	it('prefers BN bibliographic data and picks only the matching record', async () => {
		const r = await client.lookup(id);
		expect(r.results.map((x) => [x.provider, x.status])).toEqual([
			['bn', 'hit'],
			['openlibrary', 'hit']
		]);
		expect(r.merged).toMatchObject({
			title: 'Ostatnie życzenie',
			publisher: 'SuperNOWA',
			publishedYear: 2014,
			pageCount: 330,
			language: 'pl',
			format: 'paperback',
			series: { name: 'Wiedźmin' },
			olWorkKey: '/works/OL24339533W'
		});
		expect(r.merged?.contributors).toEqual([{ name: 'Andrzej Sapkowski', role: 'author' }]);
		expect(r.merged?.coverUrls?.[0]).toContain('covers.openlibrary.org/b/id/10862107');
		expect(r.quality).toBeGreaterThanOrEqual(80);
	});
});

describe('lookup — English ISBN', () => {
	it('uses Open Library and skips BN when the primary group answers', async () => {
		const client = createMetadataClient({
			fetch: fakeFetch([
				['/api/books', fixture('ol-9780547928227.json')],
				['/isbn/9780547928227.json', fixture('oli-9780547928227.json')]
			])
		});
		const r = await client.lookup(parseIdentifier('9780547928227')!);
		expect(r.results.map((x) => x.provider)).toEqual(['openlibrary']);
		expect(r.merged?.title).toBe('The Hobbit');
		expect(r.merged?.contributors?.[0]?.name).toBe('J.R.R. Tolkien');
		expect(r.merged?.pageCount).toBe(300);
	});

	it('falls back to BN and reports misses', async () => {
		const client = createMetadataClient({ fetch: fakeFetch([]) });
		const r = await client.lookup(parseIdentifier('9780547928227')!);
		expect(r.merged).toBeNull();
		expect(r.results.map((x) => [x.provider, x.status])).toEqual([
			['openlibrary', 'miss'],
			['bn', 'miss']
		]);
	});
});

describe('merge', () => {
	it('scores empty records as 0', () => {
		expect(qualityScore(mergeRecords([]))).toBe(0);
	});
});
