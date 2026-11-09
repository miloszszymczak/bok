import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, dueFor, dueState, isIsoDate, localDate, reminderFor } from './loans.ts';

describe('loan dates', () => {
	it('adds days and months', () => {
		expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
		expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
		expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
		expect(dueFor('2w', '2026-11-08')).toBe('2026-11-22');
		expect(dueFor('1m', '2026-11-08')).toBe('2026-12-08');
		expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across the DST change
	});

	it('validates ISO dates', () => {
		expect(isIsoDate('2026-02-29')).toBe(false);
		expect(isIsoDate('2028-02-29')).toBe(true);
		expect(isIsoDate('2026-1-1')).toBe(false);
	});

	it('uses the local calendar day', () => {
		const t = new Date('2026-11-08T23:30:00Z');
		expect(localDate(t, 'Europe/Warsaw')).toBe('2026-11-09');
		expect(localDate(t, 'America/New_York')).toBe('2026-11-08');
		expect(localDate(t, 'Not/AZone')).toBe('2026-11-08');
	});

	it('reminds 7, 3, 1 day before, on the day, then overdue day 1 and weekly', () => {
		const due = '2026-12-12';
		const days: string[] = [];
		for (let i = -10; i <= 30; i++) {
			const today = addDays(due, i);
			const r = reminderFor(due, today);
			if (r) days.push(`${r.kind}:${r.days}`);
		}
		expect(days).toEqual(['due_soon:7', 'due_soon:3', 'due_soon:1', 'due_soon:0', 'overdue:1', 'overdue:8', 'overdue:15', 'overdue:22', 'overdue:29']);
	});

	it('describes the due state', () => {
		expect(dueState('2026-11-10', '2026-11-08')).toEqual({ overdue: false, days: 2 });
		expect(dueState('2026-11-05', '2026-11-08')).toEqual({ overdue: true, days: 3 });
		expect(dueState(null, '2026-11-08')).toBeNull();
	});
});
