import { parseIdentifier } from '@bok/core';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

async function requireAdmin(locals: App.Locals) {
	if (!locals.user) error(401);
	const p = await locals.svc.accounts.getProfile(locals.user.id);
	if (!locals.svc.accounts.isAdmin(locals.user.email, p?.role)) error(403, 'Admins only');
}

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireAdmin(locals);
	const code = (url.searchParams.get('code') ?? '').trim();
	const id = code ? parseIdentifier(code) : null;
	if (!code) return { code, providers: locals.svc.metadata.providers, result: null, invalid: false };
	if (!id) return { code, providers: locals.svc.metadata.providers, result: null, invalid: true };
	// Raw provider call — bypasses the DB and the miss cache, writes nothing.
	const result = await locals.svc.metadata.lookup(id);
	return { code, providers: locals.svc.metadata.providers, result: JSON.parse(JSON.stringify(result)) as typeof result, invalid: false };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		await requireAdmin(locals);
		const code = String((await request.formData()).get('code') ?? '');
		const r = await locals.svc.catalog.lookup(code, { refresh: true, userId: locals.user!.id });
		if (r.status !== 'found') return fail(404, { saved: false });
		return { saved: true, workId: r.workId };
	}
};
