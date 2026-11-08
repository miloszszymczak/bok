import { createHash } from 'node:crypto';
import { editions } from '@bok/db';
import type { Services } from '@bok/server';
import { log } from '@bok/server';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';

export const COVER_SIZES = { s: 120, m: 320, l: 640 } as const;
const MAX_BYTES = 8 * 1024 * 1024;

async function download(url: string): Promise<Buffer | null> {
	const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'bok/0.1 (+https://bok.mwsz.org)' } });
	if (!res.ok) return null;
	const type = res.headers.get('content-type') ?? '';
	if (!type.startsWith('image/')) return null;
	const buf = Buffer.from(await res.arrayBuffer());
	return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
}

/** Usable = a real cover, not a 1×1 placeholder or a tiny thumbnail. */
async function usable(buf: Buffer) {
	const meta = await sharp(buf).metadata();
	return (meta.width ?? 0) >= 80 && (meta.height ?? 0) >= 100;
}

export async function mirrorCover(svc: Services, editionId: string) {
	const ed = await svc.db.query.editions.findFirst({
		where: eq(editions.id, editionId),
		columns: { id: true, coverSourceUrl: true }
	});
	if (!ed) return;
	const sources = await svc.db.query.editionSources.findMany({ where: (t, { eq }) => eq(t.editionId, editionId) });

	// Candidate order: chosen URL first, then every URL any provider offered.
	const candidates = new Set<string>();
	if (ed.coverSourceUrl) candidates.add(ed.coverSourceUrl);
	for (const s of sources) {
		const raw = s.raw as Record<string, unknown>;
		const urls = JSON.stringify(raw).match(/https?:\/\/[^"\\]+\.(?:jpe?g|png|webp)(?:\?[^"\\]*)?|https:\/\/books\.google[^"\\]+/g) ?? [];
		for (const u of urls) if (/cover|image|thumbnail|books\.google/i.test(u)) candidates.add(u.replace(/^http:/, 'https:'));
	}

	for (const url of candidates) {
		try {
			const buf = await download(url);
			if (!buf || !(await usable(buf))) continue;
			const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
			const base = `covers/${editionId}/${hash}`;
			await Promise.all(
				Object.entries(COVER_SIZES).map(async ([size, width]) => {
					const out = await sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
					await svc.storage.put(`${base}-${size}.webp`, out, 'image/webp');
				})
			);
			await svc.db.update(editions).set({ coverKey: base, coverStatus: 'ready', coverSourceUrl: url }).where(eq(editions.id, editionId));
			log.info({ editionId, url }, 'cover mirrored');
			return;
		} catch (e) {
			log.warn({ editionId, url, err: (e as Error).message }, 'cover candidate failed');
		}
	}
	await svc.db.update(editions).set({ coverStatus: 'failed' }).where(eq(editions.id, editionId));
}
