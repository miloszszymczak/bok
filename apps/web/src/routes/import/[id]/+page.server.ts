import { error, fail } from '@sveltejs/kit';
import { UUID } from '#lib/server/api.ts';
import { importGuard } from '#lib/server/imports-api.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const { imports } = locals.svc;
	const imp = await importGuard(() => imports.get(locals.user!.id, params.id));
	const [preview, review, failed] = await Promise.all([
		imp.status === 'preview' ? imports.preview(locals.user!.id, params.id) : Promise.resolve(null),
		imp.status === 'done' ? imports.reviewRows(locals.user!.id, params.id) : Promise.resolve([]),
		imp.status === 'done' ? imports.failedRows(locals.user!.id, params.id) : Promise.resolve([])
	]);
	return { imp, preview, review, failed };
};

export const actions: Actions = {
	confirm: async ({ request, params, locals }) => {
		const f = await request.formData();
		const shelvesAs = String(f.get('shelvesAs') ?? 'tags') as 'tags' | 'readlists' | 'none';
		const visibility = String(f.get('visibility') ?? 'public') as 'public' | 'followers' | 'friends' | 'private';
		await importGuard(() =>
			locals.svc.imports.confirm(locals.user!.id, params.id, { ratingScale: f.get('ratingScale') === '10' ? 10 : 5, shelvesAs, copies: f.get('copies') === 'on', visibility })
		);
		return { confirmed: true };
	},
	cancel: async ({ params, locals }) => {
		await importGuard(() => locals.svc.imports.cancel(locals.user!.id, params.id));
		return { cancelled: true };
	},
	resolve: async ({ request, params, locals }) => {
		const f = await request.formData();
		const rowId = String(f.get('rowId') ?? '');
		const choice = String(f.get('choice') ?? '');
		if (!UUID.test(rowId) || !choice) return fail(400);
		await importGuard(() => locals.svc.imports.resolve(locals.user!.id, params.id, rowId, choice === 'create' || choice === 'skip' ? choice : { workId: choice }));
		return { resolved: rowId };
	}
};
