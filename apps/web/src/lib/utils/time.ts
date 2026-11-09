import { getLocale } from '#lib/paraglide/runtime.js';

/** "5 minutes ago" / "wczoraj", falling back to a date after a week. */
export function ago(iso: string) {
	const s = (Date.now() - new Date(iso).getTime()) / 1000;
	const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
	if (s < 60) return rtf.format(-Math.max(1, Math.round(s)), 'second');
	if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
	if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
	if (s < 7 * 86400) return rtf.format(-Math.round(s / 86400), 'day');
	return new Date(iso).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
