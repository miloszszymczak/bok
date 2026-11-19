import { isStorageKind, type StorageKind } from '@bok/core';
import { error, fail, redirect } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const room = url.searchParams.get('room') ?? '';
	if (!UUID.test(room)) error(404);
	const loc = await guard(() => locals.svc.shelves.getLocation(locals.user!.id, room));
	const k = url.searchParams.get('kind');
	return { room: { id: loc.id, name: loc.name }, kind: isStorageKind(k) && k !== 'other' ? (k as StorageKind) : null };
};

export const actions: Actions = {
	default: async ({ request, url, locals }) => {
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim().slice(0, 80);
		if (!name) return fail(400, { error: m.shelves_err_name() });
		const kind = String(f.get('kind') ?? 'bookcase');
		if (!isStorageKind(kind)) return fail(400, { error: m.error_generic() });
		let layout: unknown = null;
		if (f.get('layout')) {
			try {
				layout = JSON.parse(String(f.get('layout')));
			} catch {
				return fail(400, { error: m.error_generic() });
			}
		}
		const id = await guard(() => locals.svc.shelves.createContainer(locals.user!.id, url.searchParams.get('room') ?? '', name, layout, kind));
		redirect(303, `/library/c/${id}`);
	}
};
