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
import { createNotifications } from './notifications.ts';
import { createSocial } from './social.ts';
import { createReadlists } from './readlists.ts';
import { createPosts } from './posts.ts';
import { createLoans } from './loans.ts';
import { createImports } from './imports.ts';
import { createExports } from './exports.ts';
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
export * from './notifications.ts';
export * from './social.ts';
export * from './readlists.ts';
export * from './posts.ts';
export * from './loans.ts';
export * from './imports.ts';
export * from './exports.ts';

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
	const accounts = createAccounts(db, kv, { adminEmails: opts.adminEmails ?? [], storage });
	const editor = createCatalogEditor(db, catalog, storage);
	const shelves = createShelves({ db, storage });
	const library = createLibrary({ db, catalog, accounts, storage, shelves });
	const reading = createReading({ db, storage });
	const tagging = createTagging({ db, storage });
	const notifications = createNotifications({ db, mailer, cfg: { vapid: cfg.vapid, origin: cfg.origin } });
	const social = createSocial({ db, kv, storage, notifications });
	const readlists = createReadlists({ db, storage, notifications });
	const posts = createPosts({ db, storage, notifications });
	const loans = createLoans({ db, storage, notifications });
	const exports = createExports({ db });
	const imports = createImports({ db, catalog, editor, reading, tagging, readlists, library, queue, notifications });

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
		notifications,
		social,
		readlists,
		posts,
		loans,
		imports,
		exports,
		/** Raw postgres.js client (LISTEN for live notifications). */
		sql: client,
		async close() {
			await queue.boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
			kv.disconnect();
			await client.end({ timeout: 5 });
		}
	};
}

export type Services = Awaited<ReturnType<typeof createServices>>;
