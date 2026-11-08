import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const providerRequests = new Counter({
	name: 'bok_metadata_provider_requests_total',
	help: 'Metadata provider calls by outcome and ISBN registration group',
	labelNames: ['provider', 'status', 'group'] as const,
	registers: [registry]
});

export const providerDuration = new Histogram({
	name: 'bok_metadata_provider_duration_seconds',
	help: 'Metadata provider latency',
	labelNames: ['provider'] as const,
	buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3],
	registers: [registry]
});

export const lookupOutcomes = new Counter({
	name: 'bok_lookup_total',
	help: 'ISBN/ISSN lookups by where the answer came from',
	labelNames: ['source'] as const, // db | providers | miss | miss_cached | invalid
	registers: [registry]
});
