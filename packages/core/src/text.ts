/** Lowercase, strip diacritics (including Polish ł which NFD does not decompose). */
export function foldText(s: string): string {
	return s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/ł/g, 'l')
		.replace(/Ł/g, 'L')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

export function slugify(s: string, max = 40): string {
	return foldText(s)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, max);
}

/** "Sapkowski, Andrzej" → "Andrzej Sapkowski". Leaves "Andrzej Sapkowski" untouched. */
export function invertName(name: string): string {
	const m = /^([^,]+),\s*(.+)$/.exec(name.trim());
	return m ? `${m[2]} ${m[1]}`.trim() : name.trim();
}

/** "Andrzej Sapkowski" → "Sapkowski, Andrzej" for sorting. */
export function sortName(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length < 2) return name.trim();
	const last = parts.pop()!;
	return `${last}, ${parts.join(' ')}`;
}
