import { dueState, localDate } from '@bok/core';
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { daysText } from './reading.ts';

/** Today in the device's timezone (due dates are calendar days). */
export const todayLocal = () => localDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

export const shortDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Lent to Ola until 12 Dec" / "Lent to Ola". */
export const lentLabel = (name: string, dueOn: string | null) => (dueOn ? m.loan_lent_to_until({ name, date: shortDate(dueOn) }) : m.loan_lent_to({ name }));

/** "Due in 3 days" / "Due today" / "Overdue by 2 days" / "No due date". */
export function dueText(dueOn: string | null) {
	const s = dueState(dueOn, todayLocal());
	if (!s) return m.loan_no_due();
	if (s.overdue) return m.loan_overdue_by({ days: daysText(s.days) });
	if (s.days === 0) return m.loan_due_today();
	if (s.days === 1) return m.loan_due_tomorrow();
	return m.loan_due_in({ days: daysText(s.days) });
}

export const isOverdue = (dueOn: string | null) => !!dueState(dueOn, todayLocal())?.overdue;
