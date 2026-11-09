import { describe, expect, it } from 'vitest';
import { canView, inQuietHours, localHour, type Relation, type Visibility } from './visibility.ts';

const r = (p: Partial<Relation>): Relation => ({ self: false, following: false, friends: false, blocked: false, ...p });

export const VIEWERS: Record<string, Relation | null> = {
	anonymous: null,
	stranger: r({}),
	follower: r({ following: true }),
	friend: r({ friends: true }),
	'friend+follower': r({ friends: true, following: true }),
	blocked: r({ following: true, blocked: true }),
	self: r({ self: true })
};

/** Expected matrix — the DB test checks can_view() against exactly this. */
export const EXPECTED: Record<Visibility, string[]> = {
	public: ['anonymous', 'stranger', 'follower', 'friend', 'friend+follower', 'self'],
	followers: ['follower', 'friend', 'friend+follower', 'self'],
	friends: ['friend', 'friend+follower', 'self'],
	private: ['self']
};

describe('canView', () => {
	for (const [vis, allowed] of Object.entries(EXPECTED) as [Visibility, string[]][]) {
		it(`${vis}: ${allowed.join(', ')}`, () => {
			const got = Object.entries(VIEWERS)
				.filter(([, rel]) => canView(rel, vis))
				.map(([k]) => k);
			expect(got).toEqual(allowed);
		});
	}
});

describe('quiet hours', () => {
	it('handles ranges that wrap midnight', () => {
		expect(inQuietHours(23, 22, 7)).toBe(true);
		expect(inQuietHours(3, 22, 7)).toBe(true);
		expect(inQuietHours(12, 22, 7)).toBe(false);
		expect(inQuietHours(14, 13, 15)).toBe(true);
		expect(inQuietHours(14, null, 7)).toBe(false);
	});
	it('reads the local hour', () => {
		expect(localHour(new Date('2026-11-08T22:30:00Z'), 'Europe/Warsaw')).toBe(23);
	});
});
