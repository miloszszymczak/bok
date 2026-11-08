import type { InventoryResult } from '@bok/db';
import { error, json } from '@sveltejs/kit';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 2000) : []);

/** Store a finished shelf inventory (the device classified the scans against its cached library). */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'inventory', max: 30, windowSec: 60 });
	const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!b || typeof b.sectionId !== 'string' || !UUID.test(b.sectionId)) error(400, 'sectionId is required');
	const started = new Date(String(b.startedAt));
	const result: InventoryResult = {
		confirmed: ids(b.confirmed),
		missing: ids(b.missing),
		misplaced: (Array.isArray(b.misplaced) ? b.misplaced : [])
			.filter((m): m is { copyId: string; fromSectionId: string | null } => !!m && typeof m === 'object' && UUID.test(String((m as { copyId: unknown }).copyId)))
			.map((m) => ({ copyId: m.copyId, fromSectionId: typeof m.fromSectionId === 'string' && UUID.test(m.fromSectionId) ? m.fromSectionId : null }))
			.slice(0, 2000),
		unknown: (Array.isArray(b.unknown) ? b.unknown : []).filter((c): c is string => typeof c === 'string').map((c) => c.slice(0, 32)).slice(0, 2000),
		fixed: {
			moved: Number((b.fixed as Record<string, unknown>)?.moved) || 0,
			added: Number((b.fixed as Record<string, unknown>)?.added) || 0,
			unsorted: Number((b.fixed as Record<string, unknown>)?.unsorted) || 0
		}
	};
	const id = await guard(() => locals.svc.shelves.saveInventory(user.id, b.sectionId as string, Number.isNaN(started.getTime()) ? new Date() : started, result));
	return json({ id });
};
