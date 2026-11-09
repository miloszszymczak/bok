import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	await requireUser(locals, { key: 'suggest', max: 240, windowSec: 60 });
	return json(await locals.svc.tagging.suggest(url.searchParams.get('q') ?? ''));
};
