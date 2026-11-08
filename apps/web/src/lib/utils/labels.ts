import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';

export function languageName(code: string | null | undefined): string | null {
	if (!code) return null;
	try {
		return new Intl.DisplayNames([getLocale()], { type: 'language' }).of(code) ?? code;
	} catch {
		return code;
	}
}

export function formatLabel(f: string | null | undefined): string | null {
	if (!f) return null;
	return ({ paperback: m.format_paperback(), hardcover: m.format_hardcover(), ebook: m.format_ebook(), audiobook: m.format_audiobook(), other: m.format_other() } as Record<string, string>)[f] ?? f;
}

export function roleLabel(r: string): string {
	return ({ author: m.role_author(), translator: m.role_translator(), illustrator: m.role_illustrator(), editor: m.role_editor(), narrator: m.role_narrator() } as Record<string, string>)[r] ?? r;
}
