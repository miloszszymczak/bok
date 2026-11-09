import { EventEmitter } from 'node:events';
import type { Services } from '@bok/server';
import { log } from '@bok/server';

/**
 * One Postgres LISTEN per web process; `notify()` does pg_notify('bok_notify', userId)
 * inside the insert transaction, so live badges never get ahead of the data.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);
let started: Promise<void> | null = null;

export function ensureListening(svc: Services) {
	started ??= svc.sql
		.listen('bok_notify', (userId) => bus.emit(userId))
		.then(() => undefined)
		.catch((e) => {
			started = null;
			log.error({ err: e }, 'LISTEN bok_notify failed');
		});
	return started;
}

export function onUser(userId: string, fn: () => void) {
	bus.on(userId, fn);
	return () => bus.off(userId, fn);
}
