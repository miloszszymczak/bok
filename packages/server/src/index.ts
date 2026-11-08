import { createDb } from '@bok/db';
import { createMetadataClient } from '@bok/metadata';
import { isbnGroup } from '@bok/core';
import { createAccounts } from './accounts.ts';
import { createCatalog } from './catalog.ts';
import { createCatalogEditor } from './catalog-edit.ts';
import { createLibrary } from './library.ts';
import { createShelves } from './shelves.ts';
import { createReading } from './reading.ts';
import { createTagging } from './tagging.ts';
import type { ServerConfig } from './config.ts';
import { createMailer } from './email.ts';
import { providerDuration, providerRequests } from './metrics.ts';
import { createQueue } from './queue.ts';
import { createStorage } from './storage.ts';
import { createValkey } from './valkey.ts';

export * from './config.ts';
export * from './log.ts';
export * from './valkey.ts';
export * from './storage.ts';
export * from './email.ts';
export * from './queue.ts';
export * from './metrics.ts';
export * from './catalog.ts';
export * from './accounts.ts';
export * from './catalog-edit.ts';
export * from './library.ts';
export * from './shelves.ts';
export * from './reading.ts';
export * from './tagging.ts';

export async function createServices(cfg: ServerConfig, role: 'web' | 'worker', opts: { adminEmails?: string[] } = {}) {
	const { db, client } = createDb(cfg.databaseUrl, { max: role === 'web' ? 15 : 8, applicationName: `bok-${role}` });
	const kv = createValkey(cfg.valkey);
	const storage = createStorage(cfg.r2);
	const mailer = createMailer(cfg.resend);
	const queue = await createQueue(cfg.databaseUrl, role);
	const metadata = createMetadataClient({
		googleBooksApiKey: cfg.googleBooksApiKey,
		isbndbApiKey: cfg.isbndbApiKey,
		userAgent: `bok/0.1 (+${cfg.origin})`,
		onResult(r, id) {
			providerRequests.inc({ provider: r.provider, status: r.status, group: id.kind === 'isbn' ? isbnGroup(id.isbn13) : id.kind });
			providerDuration.observe({ provider: r.provider }, r.ms / 1000);
		}
	});
	const catalog = createCatalog({ db, kv, metadata, queue });
	const accounts = createAccounts(db, kv, { adminEmails: opts.adminEmails ?? [] });
	const editor = createCatalogEditor(db, catalog, storage);
	const shelves = createShelves({ db, storage });
	const library = createLibrary({ db, catalog, accounts, storage, shelves });
	const reading = createReading({ db, storage });
	const tagging = createTagging({ db, storage });

	return {
		db,
		kv,
		storage,
		mailer,
		queue,
		metadata,
		catalog,
		accounts,
		editor,
		library,
		shelves,
		reading,
		tagging,
		async close() {
			await queue.boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
			kv.disconnect();
			await client.end({ timeout: 5 });
		}
	};
}

export type Services = Awaited<ReturnType<typeof createServices>>;
