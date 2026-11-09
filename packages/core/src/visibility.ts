/**
 * TypeScript twin of the SQL function can_view() (migration 0003). Keep them in sync —
 * the integration tests run the same matrix against both.
 */
export type Visibility = 'public' | 'followers' | 'friends' | 'private';

export interface Relation {
	self: boolean;
	/** viewer follows owner */
	following: boolean;
	friends: boolean;
	/** a block in either direction */
	blocked: boolean;
}

export function canView(viewer: Relation | null, vis: Visibility): boolean {
	if (viewer?.self) return true;
	if (viewer?.blocked) return false;
	if (vis === 'public') return true;
	if (!viewer || vis === 'private') return false;
	if (vis === 'friends') return viewer.friends;
	return viewer.following || viewer.friends; // followers (friends count as followers)
}

/** Ordered pair for the friendships table (user_low < user_high). */
export const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** Is `hour` (0–23) inside quiet hours [from, to) — wrapping past midnight? */
export function inQuietHours(hour: number, from: number | null | undefined, to: number | null | undefined): boolean {
	if (from === null || from === undefined || to === null || to === undefined || from === to) return false;
	return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export function localHour(date: Date, timeZone: string): number {
	try {
		return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(date));
	} catch {
		return date.getUTCHours();
	}
}
