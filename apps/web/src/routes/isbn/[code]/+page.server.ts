import { error, redirect } from '@sveltejs/kit';
import { rateLimit } from '@bok/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, getClientAddress }) => {
	const { catalog, kv } = locals.svc;
	if (!(await rateLimit(kv, `lookup:${locals.user?.id ?? getClientAddress()}`, 60, 60))) error(429, 'Too many lookups, slow down a little.');
	const r = await catalog.lookup(params.code, { userId: locals.user?.id });
	if (r.status === 'found') redirect(303, `/book/${r.workId}?e=${r.editionId}`);
	return { code: params.code, invalid: r.status === 'invalid' };
};
