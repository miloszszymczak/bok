import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';

export type Status = 'want_to_read' | 'reading' | 'stuck' | 'read' | 'dnf';
export const STATUS_ORDER: Status[] = ['want_to_read', 'reading', 'stuck', 'read', 'dnf'];

export function statusLabel(s: Status | null | undefined): string {
	switch (s) {
		case 'want_to_read':
			return m.status_want();
		case 'reading':
			return m.status_reading();
		case 'stuck':
			return m.status_stuck();
		case 'read':
			return m.status_read();
		case 'dnf':
			return m.status_dnf();
		default:
			return m.status_none();
	}
}

export const statusTone = (s: Status | null | undefined) =>
	s === 'reading' ? 'bg-accent text-accent-ink' : s === 'read' ? 'bg-accent-soft text-accent' : s === 'stuck' ? 'bg-warn/15 text-warn' : s === 'dnf' ? 'bg-line text-muted' : s === 'want_to_read' ? 'bg-[#e9e1f3] text-[#5b3f8a] dark:bg-[#2d2540] dark:text-[#c8b5ec]' : 'border border-line text-muted';

export function paceLabel(p: string | null | undefined) {
	return p === 'intensive' ? m.pace_intensive() : p === 'slow' ? m.pace_slow() : p === 'usual' ? m.pace_usual() : '';
}

export function formatLabelRead(f: string) {
	return f === 'ebook' ? m.read_format_ebook() : f === 'audiobook' ? m.read_format_audio() : m.read_format_paper();
}

export function progressText(progress: number | null, total: number | null, format: string) {
	if (progress === null) return '';
	if (format === 'audiobook') {
		const h = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
		return total ? `${h(progress)} / ${h(total)}` : h(progress);
	}
	if (format === 'ebook' && (total === 100 || !total)) return `${progress}%`;
	return total ? m.progress_pages_of({ page: progress, total }) : m.progress_page({ page: progress });
}

export function finishedLabel(date: string | null, precision: string | null) {
	if (!date || !precision) return m.log_past();
	const d = new Date(`${date}T12:00:00Z`);
	if (precision === 'year') return String(d.getUTCFullYear());
	if (precision === 'month') return d.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
	return d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const monthName = (month: number) => new Date(Date.UTC(2000, month - 1, 15)).toLocaleDateString(getLocale(), { month: 'long', timeZone: 'UTC' });

/** "1 day / 3 days", "1 dzień / 3 dni / 5 dni" — Polish needs real plural forms. */
export function daysText(n: number) {
	const rule = new Intl.PluralRules(getLocale()).select(n);
	return rule === 'one' ? m.days_one({ n }) : rule === 'few' ? m.days_few({ n }) : m.days_many({ n });
}
