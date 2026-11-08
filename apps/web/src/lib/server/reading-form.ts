// Form parsing shared by the book page (finish) and the read page (edit).
export const pick = <T extends string>(v: FormDataEntryValue | null, allowed: readonly T[]) => (allowed.includes(String(v) as T) ? (String(v) as T) : null);
export const intOrNull = (v: FormDataEntryValue | null) => {
	const n = Number(String(v ?? '').trim());
	return String(v ?? '').trim() && Number.isFinite(n) ? Math.round(n) : null;
};

/** Shared by the book page (finish) and the read page (edit). */
export function finishInput(f: FormData) {
	return {
		outcome: pick(f.get('outcome'), ['finished', 'dnf'] as const) ?? 'finished',
		date: String(f.get('date') ?? '') || null,
		precision: pick(f.get('precision'), ['day', 'month', 'year'] as const),
		rating: intOrNull(f.get('rating')),
		review: String(f.get('review') ?? ''),
		reviewSpoiler: !!f.get('reviewSpoiler'),
		durationDaysOverride: intOrNull(f.get('durationDaysOverride')),
		pace: pick(f.get('pace'), ['intensive', 'usual', 'slow'] as const),
		visibility: pick(f.get('visibility'), ['public', 'followers', 'friends', 'private'] as const) ?? 'public'
	};
}

