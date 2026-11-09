import { error, fail } from '@sveltejs/kit';
import { UUID } from '#lib/server/api.ts';
import type { Actions, PageServerLoad } from './$types';

async function requireAdmin(locals: App.Locals) {
	if (!locals.user) error(401);
	const p = await locals.svc.accounts.getProfile(locals.user.id);
	if (!locals.svc.accounts.isAdmin(locals.user.email, p?.role)) error(403, 'Admins only');
}

export const load: PageServerLoad = async ({ locals }) => {
	await requireAdmin(locals);
	const rows = await locals.svc.social.openReports();
	return { reports: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })) };
};

export const actions: Actions = {
	resolve: async ({ request, locals }) => {
		await requireAdmin(locals);
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const action = String(f.get('action') ?? '');
		if (!UUID.test(id) || !['dismiss', 'hide', 'suspend'].includes(action)) return fail(400);
		await locals.svc.social.resolve(locals.user!.id, id, action as 'dismiss' | 'hide' | 'suspend');
		return { resolved: action };
	},
	restore: async ({ request, locals }) => {
		await requireAdmin(locals);
		const id = String((await request.formData()).get('userId') ?? '');
		if (!UUID.test(id)) return fail(400);
		await locals.svc.social.restore(id);
		return { restored: true };
	}
};
