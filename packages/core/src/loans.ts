/**
 * Lending date maths. Dates are ISO calendar days (YYYY-MM-DD); "today" is always the
 * recipient's local day, so reminders follow each user's timezone.
 */

export type DueChoice = '2w' | '1m';
/** Reminders go out from this local hour on (the job runs hourly, deduplicated per day). */
export const REMINDER_HOUR = 9;
/** Days before the due date when the borrower is reminded (0 = on the day). */
export const REMIND_BEFORE = [7, 3, 1, 0] as const;
export const LOAN_NAME_MAX = 80;

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(day(s)) === s;

export function addDays(date: string, n: number): string {
	return iso(day(date) + n * 86_400_000);
}

/** Calendar months, clamped to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, n: number): string {
	const y = +date.slice(0, 4), mo = +date.slice(5, 7) - 1 + n, d = +date.slice(8, 10);
	const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
	return iso(Date.UTC(y, mo, Math.min(d, last)));
}

/** b − a in whole days. */
export const daysBetween = (a: string, b: string) => Math.round((day(b) - day(a)) / 86_400_000);

export const dueFor = (choice: DueChoice, today: string) => (choice === '2w' ? addDays(today, 14) : addMonths(today, 1));

/** The calendar day it is now in `timeZone`. */
export function localDate(now: Date, timeZone: string): string {
	try {
		return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(now);
	} catch {
		return now.toISOString().slice(0, 10);
	}
}

export type Reminder = { kind: 'due_soon'; days: number } | { kind: 'overdue'; days: number };

/**
 * Which reminder (if any) belongs to `today` for a loan due on `dueOn`:
 * 7, 3 and 1 day before + on the day (borrower); overdue on day 1, then weekly (both sides).
 */
export function reminderFor(dueOn: string, today: string): Reminder | null {
	const d = daysBetween(today, dueOn);
	if ((REMIND_BEFORE as readonly number[]).includes(d)) return { kind: 'due_soon', days: d };
	if (d < 0 && (-d - 1) % 7 === 0) return { kind: 'overdue', days: -d };
	return null;
}

/** For labels: days left (≥ 0) or overdue by n days. */
export function dueState(dueOn: string | null, today: string): { overdue: boolean; days: number } | null {
	if (!dueOn) return null;
	const d = daysBetween(today, dueOn);
	return d < 0 ? { overdue: true, days: -d } : { overdue: false, days: d };
}
