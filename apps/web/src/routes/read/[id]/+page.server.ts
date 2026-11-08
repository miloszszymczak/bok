import { error, redirect } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import { finishInput } from '#lib/server/reading-form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const { reading } = locals.svc;
	const r = await guard(() => reading.read(locals.user!.id, params.id));
	const medianRate = await reading.medianRate(locals.user!.id);
	return {
		...r,
		events: r.events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
		read: { ...r.read, createdAt: r.read.createdAt.toISOString(), updatedAt: r.read.updatedAt.toISOString(), lastActivityAt: r.read.lastActivityAt.toISOString() },
		medianRate
	};
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const input = finishInput(await request.formData());
		await guard(() => locals.svc.reading.updateRead(locals.user!.id, params.id, input));
		return { saved: true };
	},
	delete: async ({ params, locals }) => {
		const r = await guard(() => locals.svc.reading.read(locals.user!.id, params.id));
		await locals.svc.reading.deleteRead(locals.user!.id, params.id);
		redirect(303, `/book/${r.work.id}`);
	}
};
