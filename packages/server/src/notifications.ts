import { inQuietHours, localHour } from '@bok/core';
import { notificationPrefs, notifications, profiles, pushSubscriptions, user, type Db } from '@bok/db';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import * as webpush from 'web-push';
import { actionEmail, type Mailer } from './email.ts';
import { log } from './log.ts';

export interface Channels {
	inapp: boolean;
	push: boolean;
	email: boolean;
}

/** Every notification type and its default channels. Later phases add theirs here. */
export const NOTIFICATION_TYPES = {
	follow: { inapp: true, push: false, email: false },
	friend_request: { inapp: true, push: true, email: true },
	friend_accept: { inapp: true, push: true, email: false },
	readlist_saved: { inapp: true, push: false, email: false },
	comment: { inapp: true, push: true, email: false },
	like: { inapp: true, push: false, email: false },
	mention: { inapp: true, push: true, email: false },
	loan_request: { inapp: true, push: true, email: true },
	loan_approved: { inapp: true, push: true, email: false },
	loan_declined: { inapp: true, push: false, email: false },
	loan_lent: { inapp: true, push: false, email: false },
	loan_extension_request: { inapp: true, push: true, email: false },
	loan_extension_answer: { inapp: true, push: true, email: false },
	loan_returned: { inapp: true, push: true, email: false },
	loan_due: { inapp: true, push: true, email: false },
	loan_overdue: { inapp: true, push: true, email: true },
	import_done: { inapp: true, push: true, email: false }
} satisfies Record<string, Channels>;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

type Data = Record<string, unknown>;
const fmtDate = (lang: 'en' | 'pl', iso: unknown) =>
	typeof iso === 'string' ? new Date(iso + 'T12:00:00Z').toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
const t = (d: Data) => String(d.title ?? '');
const n = (d: Data) => Number(d.days ?? 0);
const enDays = (k: number) => (k === 1 ? '1 day' : `${k} days`);
const plDays = (k: number) => (k === 1 ? '1 dzień' : `${k} dni`); // 1 dzień; 2–4, 5+, 22… all "dni"

const TEXT: Record<'en' | 'pl', Record<NotificationType, (actor: string, d: Data) => { title: string; body: string }>> = {
	en: {
		follow: (a) => ({ title: 'New follower', body: `${a} started following you` }),
		friend_request: (a) => ({ title: 'Friend request', body: `${a} wants to be friends on bok` }),
		friend_accept: (a) => ({ title: 'Friend request accepted', body: `${a} accepted your friend request` }),
		readlist_saved: (a) => ({ title: 'List saved', body: `${a} saved one of your lists` }),
		comment: (a) => ({ title: 'New comment', body: `${a} commented on your post` }),
		like: (a, d) => ({ title: 'New like', body: d.target === 'comment' ? `${a} liked your comment` : `${a} liked your post` }),
		mention: (a) => ({ title: 'You were mentioned', body: `${a} mentioned you` }),
		loan_request: (a, d) => ({ title: 'Borrow request', body: `${a} would like to borrow “${t(d)}”` }),
		loan_approved: (a, d) => ({ title: 'Request accepted', body: `${a} will lend you “${t(d)}”` + (d.dueOn ? ` until ${fmtDate('en', d.dueOn)}` : '') }),
		loan_declined: (a, d) => ({ title: 'Request declined', body: `${a} can't lend you “${t(d)}” right now` }),
		loan_lent: (a, d) => ({ title: 'Book lent to you', body: `${a} lent you “${t(d)}”` + (d.dueOn ? ` until ${fmtDate('en', d.dueOn)}` : '') }),
		loan_extension_request: (a, d) => ({ title: 'Extension request', body: `${a} asks to keep “${t(d)}” until ${fmtDate('en', d.to)}` }),
		loan_extension_answer: (a, d) =>
			d.approved
				? { title: 'Extension accepted', body: `${a}: keep “${t(d)}” until ${fmtDate('en', d.dueOn)}` }
				: { title: 'Extension declined', body: `${a} would like “${t(d)}” back by ${fmtDate('en', d.dueOn)}` },
		loan_returned: (a, d) => ({ title: 'Book returned?', body: `${a} says “${t(d)}” is back — please confirm` }),
		loan_due: (_a, d) => ({
			title: 'Return reminder',
			body: n(d) === 0 ? `“${t(d)}” is due back today` : n(d) === 1 ? `“${t(d)}” is due back tomorrow` : `“${t(d)}” is due back in ${n(d)} days`
		}),
		loan_overdue: (a, d) =>
			d.side === 'l'
				? { title: 'Overdue loan', body: `${a === 'bok' ? String(d.otherName ?? '') : a} still has “${t(d)}” (${enDays(n(d))} overdue)` }
				: { title: 'Overdue', body: `“${t(d)}” was due back ${enDays(n(d))} ago` },
		import_done: (_a, d) => ({ title: 'Import finished', body: `${Number(d.matched ?? 0) + Number(d.created ?? 0)} books imported` + (Number(d.review ?? 0) ? `, ${d.review} to check` : '') })
	},
	pl: {
		follow: (a) => ({ title: 'Nowy obserwujący', body: `${a} obserwuje Cię od teraz` }),
		friend_request: (a) => ({ title: 'Zaproszenie do znajomych', body: `${a} chce być Twoim znajomym w bok` }),
		friend_accept: (a) => ({ title: 'Zaproszenie przyjęte', body: `${a} przyjmuje Twoje zaproszenie do znajomych` }),
		readlist_saved: (a) => ({ title: 'Lista zapisana', body: `${a} zapisuje jedną z Twoich list` }),
		comment: (a) => ({ title: 'Nowy komentarz', body: `${a} komentuje Twój wpis` }),
		like: (a, d) => ({ title: 'Nowe polubienie', body: d.target === 'comment' ? `${a} lubi Twój komentarz` : `${a} lubi Twój wpis` }),
		mention: (a) => ({ title: 'Wzmianka', body: `${a} wspomina o Tobie` }),
		loan_request: (a, d) => ({ title: 'Prośba o pożyczenie', body: `${a} prosi o pożyczenie „${t(d)}”` }),
		loan_approved: (a, d) => ({ title: 'Prośba przyjęta', body: `${a} pożyczy Ci „${t(d)}”` + (d.dueOn ? ` do ${fmtDate('pl', d.dueOn)}` : '') }),
		loan_declined: (a, d) => ({ title: 'Prośba odrzucona', body: `${a} nie może teraz pożyczyć Ci „${t(d)}”` }),
		loan_lent: (a, d) => ({ title: 'Pożyczona książka', body: `${a} pożycza Ci „${t(d)}”` + (d.dueOn ? ` do ${fmtDate('pl', d.dueOn)}` : '') }),
		loan_extension_request: (a, d) => ({ title: 'Prośba o przedłużenie', body: `${a} prosi o przedłużenie „${t(d)}” do ${fmtDate('pl', d.to)}` }),
		loan_extension_answer: (a, d) =>
			d.approved
				? { title: 'Przedłużenie przyjęte', body: `${a}: „${t(d)}” możesz oddać do ${fmtDate('pl', d.dueOn)}` }
				: { title: 'Przedłużenie odrzucone', body: `${a} prosi o zwrot „${t(d)}” do ${fmtDate('pl', d.dueOn)}` },
		loan_returned: (a, d) => ({ title: 'Książka oddana?', body: `${a} zgłasza zwrot „${t(d)}” — potwierdź` }),
		loan_due: (_a, d) => ({
			title: 'Przypomnienie o zwrocie',
			body: n(d) === 0 ? `Termin zwrotu „${t(d)}”: dziś` : n(d) === 1 ? `Termin zwrotu „${t(d)}”: jutro` : `Termin zwrotu „${t(d)}”: za ${n(d)} dni`
		}),
		loan_overdue: (a, d) =>
			d.side === 'l'
				? { title: 'Zaległy zwrot', body: `${a === 'bok' ? String(d.otherName ?? '') : a} nadal ma „${t(d)}” (${plDays(n(d))} po terminie)` }
				: { title: 'Po terminie', body: `Zwrot „${t(d)}” jest spóźniony o ${plDays(n(d))}` },
		import_done: (_a, d) => ({ title: 'Import zakończony', body: `Zaimportowane książki: ${Number(d.matched ?? 0) + Number(d.created ?? 0)}` + (Number(d.review ?? 0) ? `, do sprawdzenia: ${d.review}` : '') })
	}
};
const CTA = { en: { open: 'Open bok', footer: 'You can change which emails you get in Settings → Notifications.' }, pl: { open: 'Otwórz bok', footer: 'Możesz zmienić, jakie e-maile dostajesz, w Ustawieniach → Powiadomienia.' } };

export interface NotifyConfig {
	vapid?: { publicKey: string; privateKey: string; subject: string };
	origin: string;
}

export function createNotifications(deps: { db: Db; mailer: Mailer; cfg: NotifyConfig }) {
	const { db, mailer, cfg } = deps;
	const pushEnabled = !!(cfg.vapid?.publicKey && cfg.vapid.privateKey);
	if (pushEnabled) webpush.setVapidDetails(cfg.vapid!.subject, cfg.vapid!.publicKey, cfg.vapid!.privateKey);

	async function channels(userId: string, type: NotificationType): Promise<Channels> {
		const p = await db.query.notificationPrefs.findFirst({ where: and(eq(notificationPrefs.userId, userId), eq(notificationPrefs.type, type)) });
		return p ? { inapp: p.inapp, push: p.push, email: p.email } : NOTIFICATION_TYPES[type];
	}

	function render(type: NotificationType, locale: string, actorName: string, data: Data) {
		const lang: 'pl' | 'en' = locale === 'pl' ? 'pl' : 'en';
		return { ...TEXT[lang][type](actorName, data), lang };
	}

	const urlFor = (type: NotificationType, data: Record<string, unknown>, actorHandle?: string | null) =>
		(data.url as string | undefined) ?? (actorHandle ? `/u/${actorHandle}` : '/notifications');

	/** Push + email for one stored notification (fire-and-forget from the caller). */
	async function deliver(id: string, now = new Date()) {
		const [n] = await db
			.select({
				id: notifications.id,
				userId: notifications.userId,
				type: notifications.type,
				data: notifications.data,
				actorName: sql<string | null>`(select display_name from profiles where user_id = ${notifications.actorId})`,
				actorHandle: sql<string | null>`(select handle from profiles where user_id = ${notifications.actorId})`,
				locale: profiles.locale,
				timezone: profiles.timezone,
				quietFrom: profiles.quietFrom,
				quietTo: profiles.quietTo,
				email: user.email
			})
			.from(notifications)
			.innerJoin(profiles, eq(profiles.userId, notifications.userId))
			.innerJoin(user, eq(user.id, notifications.userId))
			.where(eq(notifications.id, id));
		if (!n) return { push: 0, email: false };
		const type = n.type as NotificationType;
		const ch = await channels(n.userId, type);
		const text = render(type, n.locale, n.actorName ?? 'bok', n.data as Data);
		const url = urlFor(type, n.data as Record<string, unknown>, n.actorHandle);
		let pushed = 0;
		if (ch.push && pushEnabled && !inQuietHours(localHour(now, n.timezone), n.quietFrom, n.quietTo)) {
			const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, n.userId));
			const payload = JSON.stringify({ title: text.title, body: text.body, url, tag: `${type}:${n.id}` });
			await Promise.all(
				subs.map(async (s) => {
					try {
						await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: 'normal' });
						pushed++;
						await db.update(pushSubscriptions).set({ lastUsedAt: now }).where(eq(pushSubscriptions.id, s.id));
					} catch (e) {
						const status = (e as { statusCode?: number }).statusCode;
						// Gone / not found: the browser dropped the subscription.
						if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
						else log.warn({ err: (e as Error).message, status }, 'push failed');
					}
				})
			);
		}
		let emailed = false;
		if (ch.email) {
			await mailer
				.send(actionEmail({ to: n.email, subject: text.title, heading: text.title, body: text.body, cta: CTA[text.lang].open, url: cfg.origin + url, footer: CTA[text.lang].footer }))
				.then(() => (emailed = true))
				.catch((e) => log.error({ err: e }, 'notification email failed'));
		}
		return { push: pushed, email: emailed };
	}

	const api = {
		pushEnabled,
		publicKey: cfg.vapid?.publicKey ?? null,
		deliver,

		/**
		 * Store + announce (Postgres NOTIFY → live badge) + deliver push/email in the background.
		 * Skipped when the recipient blocked the actor (or vice versa) or turned the type off.
		 */
		async notify(userId: string, type: NotificationType, opts: { actorId?: string | null; data?: Record<string, unknown>; dedupeKey?: string } = {}) {
			if (opts.actorId === userId) return null;
			if (opts.actorId) {
				const blocked = await db.execute(sql`select 1 from blocks where (blocker_id = ${userId} and blocked_id = ${opts.actorId}) or (blocker_id = ${opts.actorId} and blocked_id = ${userId}) limit 1`);
				if (blocked.length) return null;
			}
			const ch = await channels(userId, type);
			if (!ch.inapp && !ch.push && !ch.email) return null;
			const id = await db.transaction(async (tx) => {
				const [row] = await tx
					.insert(notifications)
					.values({ userId, type, actorId: opts.actorId ?? null, data: opts.data ?? {}, dedupeKey: opts.dedupeKey ?? null, readAt: ch.inapp ? null : new Date() })
					.onConflictDoNothing()
					.returning({ id: notifications.id });
				if (row) await tx.execute(sql`select pg_notify('bok_notify', ${userId})`);
				return row?.id ?? null;
			});
			if (id) void deliver(id).catch((e) => log.error({ err: e }, 'notification delivery failed'));
			return id;
		},

		async list(userId: string, limit = 50) {
			return db
				.select({
					id: notifications.id,
					type: notifications.type,
					data: notifications.data,
					readAt: notifications.readAt,
					createdAt: notifications.createdAt,
					actorHandle: sql<string | null>`(select handle from profiles where user_id = ${notifications.actorId})`,
					actorName: sql<string | null>`(select display_name from profiles where user_id = ${notifications.actorId})`,
					actorAvatar: sql<string | null>`(select avatar_key from profiles where user_id = ${notifications.actorId})`
				})
				.from(notifications)
				.where(eq(notifications.userId, userId))
				.orderBy(desc(notifications.createdAt))
				.limit(limit);
		},

		async unread(userId: string) {
			const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
			return r?.n ?? 0;
		},

		async markRead(userId: string, ids?: string[]) {
			await db
				.update(notifications)
				.set({ readAt: new Date() })
				.where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids ? inArray(notifications.id, ids) : undefined));
			await db.execute(sql`select pg_notify('bok_notify', ${userId})`);
		},

		async prefs(userId: string) {
			const rows = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
			return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => {
				const r = rows.find((x) => x.type === type);
				return { type, ...(r ? { inapp: r.inapp, push: r.push, email: r.email } : NOTIFICATION_TYPES[type]) };
			});
		},

		async setPrefs(userId: string, prefs: { type: string; inapp: boolean; push: boolean; email: boolean }[]) {
			for (const p of prefs) {
				if (!(p.type in NOTIFICATION_TYPES)) continue;
				await db
					.insert(notificationPrefs)
					.values({ userId, type: p.type, inapp: p.inapp, push: p.push, email: p.email })
					.onConflictDoUpdate({ target: [notificationPrefs.userId, notificationPrefs.type], set: { inapp: p.inapp, push: p.push, email: p.email } });
			}
		},

		async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent = '') {
			await db
				.insert(pushSubscriptions)
				.values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 300) })
				.onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
		},

		async unsubscribe(userId: string, endpoint: string) {
			await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
		},

		async subscriptionCount(userId: string) {
			const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
			return r?.n ?? 0;
		}
	};
	return api;
}

export type Notifications = ReturnType<typeof createNotifications>;
