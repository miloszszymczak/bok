import { EventEmitter } from 'node:events';
import type { Services } from '@bok/server';
import { log } from '@bok/server';

/**
 * One Postgres LISTEN per web process; `notify()` does pg_notify('bok_notify', userId)
 * inside the insert transaction, so live badges never get ahead of the data.
 *
 * postgres.js re-LISTENs by itself after a dropped connection; each (re)listen emits RESYNC so
 * open streams resend their count (anything missed in between is caught up). If LISTEN can't be
 * set up at all, streams are told (ensureListening → false) and we retry with backoff.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);
const RESYNC = Symbol('resync');
let started: Promise<boolean> | null = null;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function ensureListening(svc: Services): Promise<boolean> {
	started ??= svc.sql
		.listen(
			'bok_notify',
			(userId) => bus.emit(userId),
			() => {
				failures = 0;
				bus.emit(RESYNC);
			}
		)
		.then(() => true)
		.catch((e) => {
			started = null;
			failures++;
			const delay = Math.min(60_000, 1000 * 2 ** Math.min(failures, 6));
			log.error({ err: e, retryInMs: delay }, 'LISTEN bok_notify failed');
			retryTimer ??= setTimeout(() => {
				retryTimer = null;
				void ensureListening(svc);
			}, delay);
			return false;
		});
	return started;
}

/** `fn` runs when this user's notifications change, or after a (re)connection (to resync). */
export function onUser(userId: string, fn: () => void) {
	bus.on(userId, fn);
	bus.on(RESYNC, fn);
	return () => {
		bus.off(userId, fn);
		bus.off(RESYNC, fn);
	};
}
