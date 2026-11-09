import { error, fail, redirect } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import { finishInput } from '#lib/server/reading-form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const { reading } = locals.svc;
	const own = locals.user ? await locals.svc.db.query.reads.findFirst({ where: (t, { eq }) => eq(t.id, params.id), columns: { userId: true } }) : null;
	if (!own || own.userId !== locals.user?.id) {
		const pub = await reading.publicRead(locals.user?.id ?? null, params.id);
		if (!pub) error(404, 'Not found');
		const owner = await locals.svc.accounts.getProfile(pub.read.userId);
		return {
			mine: false as const,
			owner: owner ? { handle: owner.handle, displayName: owner.displayName } : null,
			read: { ...pub.read, createdAt: pub.read.createdAt.toISOString(), updatedAt: pub.read.updatedAt.toISOString(), lastActivityAt: pub.read.lastActivityAt.toISOString() },
			estimatedDays: pub.estimatedDays,
			suggestedPace: null,
			work: pub.work,
			events: [] as { id: string; type: string; progress: number | null; occurredAt: string }[],
			medianRate: null
		};
	}
	const r = await guard(() => reading.read(locals.user!.id, params.id));
	const medianRate = await reading.medianRate(locals.user!.id);
	return {
		mine: true as const,
		owner: null,
		...r,
		events: r.events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
		read: { ...r.read, createdAt: r.read.createdAt.toISOString(), updatedAt: r.read.updatedAt.toISOString(), lastActivityAt: r.read.lastActivityAt.toISOString() },
		medianRate
	};
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401);
		const input = finishInput(await request.formData());
		await guard(() => locals.svc.reading.updateRead(locals.user!.id, params.id, input));
		return { saved: true };
	},
	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401);
		const r = await guard(() => locals.svc.reading.read(locals.user!.id, params.id));
		await locals.svc.reading.deleteRead(locals.user!.id, params.id);
		redirect(303, `/book/${r.work.id}`);
	}
};
