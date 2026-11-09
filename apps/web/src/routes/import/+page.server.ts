import { fail, redirect } from '@sveltejs/kit';
import { ImportError, IMPORT_MAX_BYTES } from '@bok/server';
import { rateLimit } from '@bok/server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({ imports: await locals.svc.imports.list(locals.user!.id) });

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		const user = locals.user!;
		if (!(await rateLimit(locals.svc.kv, `import-upload:${user.id}`, 10, 3600))) return fail(429, { error: 'rate' });
		const file = (await request.formData()).get('file');
		if (!(file instanceof File) || !file.size) return fail(400, { error: 'empty' });
		if (file.size > IMPORT_MAX_BYTES) return fail(400, { error: 'too_large' });
		let id: string;
		try {
			id = await locals.svc.imports.upload(user.id, file.name, await file.text());
		} catch (e) {
			if (e instanceof ImportError) return fail(400, { error: e.code });
			throw e;
		}
		redirect(303, `/import/${id}`);
	}
};
