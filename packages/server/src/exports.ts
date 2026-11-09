import { GOODREADS_HEADER, toCsv } from '@bok/core';
import type { Db } from '@bok/db';
import { sql } from 'drizzle-orm';

/**
 * Data export: a Goodreads-compatible CSV (re-importable here and on Goodreads/StoryGraph) and
 * a full JSON dump of everything that belongs to the account (GDPR).
 */
export function createExports(deps: { db: Db }) {
	const { db } = deps;
	const gdDate = (d: string | null) => (d ? d.replaceAll('-', '/') : '');

	return {
		async goodreadsCsv(userId: string) {
			const rows = await db.execute<{
				work_id: string;
				title: string;
				authors: string[];
				isbn13: string | null;
				isbn10: string | null;
				publisher: string | null;
				format: string | null;
				pages: number | null;
				year: number | null;
				first_year: number | null;
				status: string | null;
				date_read: string | null;
				rating: number | null;
				review: string | null;
				spoiler: boolean | null;
				read_count: number;
				owned: number;
				tags: string[];
				added: Date;
			}>(sql`
				with mine as (
					select work_id from reading_states where user_id = ${userId}
					union select e.work_id from copies c join editions e on e.id = c.edition_id join household_members hm on hm.household_id = c.household_id and hm.user_id = ${userId}
				), last as (
					select distinct on (work_id) work_id, edition_id, finished_on, rating, review, review_spoiler
					from reads where user_id = ${userId} and outcome = 'finished'
					order by work_id, finished_on desc nulls last, created_at desc
				)
				select w.id as work_id, w.title,
					coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = w.id), '{}') as authors,
					e.isbn13, e.isbn10, e.publisher, e.format, e.page_count as pages, e.published_year as year, w.first_published_year as first_year,
					rs.status, last.finished_on::text as date_read, last.rating, last.review, last.review_spoiler as spoiler,
					(select count(*)::int from reads r where r.user_id = ${userId} and r.work_id = w.id and r.outcome = 'finished') as read_count,
					(select count(*)::int from copies c join editions e2 on e2.id = c.edition_id join household_members hm on hm.household_id = c.household_id and hm.user_id = ${userId} where e2.work_id = w.id) as owned,
					coalesce((select array_agg(t.name order by t.name) from user_work_tags ut join tags t on t.id = ut.tag_id where ut.user_id = ${userId} and ut.work_id = w.id), '{}') as tags,
					coalesce(rs.created_at, w.created_at) as added
				from mine join works w on w.id = mine.work_id
				left join reading_states rs on rs.user_id = ${userId} and rs.work_id = w.id
				left join last on last.work_id = w.id
				left join lateral (
					select * from editions ed where ed.work_id = w.id
					order by (ed.id = last.edition_id) desc nulls last,
						exists (select 1 from copies c join household_members hm on hm.household_id = c.household_id and hm.user_id = ${userId} where c.edition_id = ed.id) desc,
						ed.metadata_quality desc
					limit 1
				) e on true
				order by w.title`);
			const shelf = (s: string | null) => (s === 'read' ? 'read' : s === 'reading' || s === 'stuck' ? 'currently-reading' : s === 'dnf' ? 'did-not-finish' : 'to-read');
			const binding = (f: string | null) => ({ paperback: 'Paperback', hardcover: 'Hardcover', ebook: 'Kindle Edition', audiobook: 'Audiobook' })[f ?? ''] ?? '';
			const body = rows.map((r) => {
				const tags = r.tags.join(', ');
				return [
					r.work_id, r.title, r.authors[0] ?? '', r.authors[0] ? r.authors[0].split(' ').reverse().join(', ') : '', r.authors.slice(1).join(', '),
					r.isbn10 ? `="${r.isbn10}"` : '=""', r.isbn13 ? `="${r.isbn13}"` : '=""',
					r.rating ? Math.round(r.rating / 2) : 0, '', r.publisher ?? '', binding(r.format), r.pages ?? '', r.year ?? '', r.first_year ?? '',
					gdDate(r.date_read), gdDate(new Date(r.added).toISOString().slice(0, 10)), tags, tags, shelf(r.status), r.review ?? '', r.spoiler ? 'true' : '', '', r.read_count, r.owned
				];
			});
			return toCsv([GOODREADS_HEADER, ...body]);
		},

		/** Everything tied to the account, table by table (rows as stored). */
		async fullJson(userId: string) {
			const q = async (s: ReturnType<typeof sql>) => [...(await db.execute(s))];
			const hh = sql`(select household_id from household_members where user_id = ${userId})`;
			return {
				format: 'bok-export',
				version: 1,
				exportedAt: new Date().toISOString(),
				account: (await q(sql`select id, name, email, email_verified, created_at from "user" where id = ${userId}`))[0] ?? null,
				profile: (await q(sql`select * from profiles where user_id = ${userId}`))[0] ?? null,
				households: await q(sql`select h.*, hm.role, hm.is_default from households h join household_members hm on hm.household_id = h.id and hm.user_id = ${userId}`),
				rooms: await q(sql`select * from locations where household_id in ${hh}`),
				furniture: await q(sql`select * from containers where household_id in ${hh}`),
				shelves: await q(sql`select * from sections where household_id in ${hh}`),
				copies: await q(sql`select c.*, e.isbn13, e.title from copies c join editions e on e.id = c.edition_id where c.household_id in ${hh}`),
				readingStates: await q(sql`select rs.*, w.title from reading_states rs join works w on w.id = rs.work_id where rs.user_id = ${userId}`),
				reads: await q(sql`select r.*, w.title from reads r join works w on w.id = r.work_id where r.user_id = ${userId} order by r.finished_on nulls last`),
				readingEvents: await q(sql`select * from reading_events where user_id = ${userId} order by occurred_at`),
				goals: await q(sql`select * from reading_goals where user_id = ${userId}`),
				tags: await q(sql`select ut.work_id, w.title, t.name from user_work_tags ut join tags t on t.id = ut.tag_id join works w on w.id = ut.work_id where ut.user_id = ${userId}`),
				readlists: await q(sql`select l.*, coalesce((select json_agg(json_build_object('workId', i.work_id, 'editionId', i.edition_id, 'note', i.note) order by i.position) from readlist_items i where i.readlist_id = l.id), '[]') as items from readlists l where l.owner_id = ${userId}`),
				savedLists: await q(sql`select * from readlist_saves where user_id = ${userId}`),
				posts: await q(sql`select * from posts where author_id = ${userId} order by created_at`),
				comments: await q(sql`select * from comments where author_id = ${userId} order by created_at`),
				likes: await q(sql`select * from likes where user_id = ${userId}`),
				following: await q(sql`select f.followee_id, p.handle, f.created_at from follows f join profiles p on p.user_id = f.followee_id where f.follower_id = ${userId}`),
				followers: await q(sql`select f.follower_id, p.handle, f.created_at from follows f join profiles p on p.user_id = f.follower_id where f.followee_id = ${userId}`),
				friendships: await q(sql`select * from friendships where user_low = ${userId} or user_high = ${userId}`),
				blocks: await q(sql`select * from blocks where blocker_id = ${userId}`),
				reports: await q(sql`select * from reports where reporter_id = ${userId}`),
				loans: await q(sql`select l.*, w.title from loans l join works w on w.id = l.work_id where l.lender_id = ${userId} or l.borrower_id = ${userId}`),
				notificationPrefs: await q(sql`select * from notification_prefs where user_id = ${userId}`),
				notifications: await q(sql`select * from notifications where user_id = ${userId} order by created_at desc limit 1000`),
				pushSubscriptions: await q(sql`select id, user_agent, created_at, last_used_at from push_subscriptions where user_id = ${userId}`),
				imports: await q(sql`select id, source, file_name, status, options, stats, created_at from imports where user_id = ${userId}`),
				metadataEdits: await q(sql`select * from metadata_edits where user_id = ${userId}`)
			};
		}
	};
}

export type Exports = ReturnType<typeof createExports>;
