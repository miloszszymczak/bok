import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** Bookstore mode: GET ?code= → is this book (or another edition of it) in my library? */
export const GET: RequestHandler = async ({ url, locals }) => {
	const user = await requireUser(locals, { key: 'check', max: 120, windowSec: 60 });
	return json(await locals.svc.library.check(user.id, (url.searchParams.get('code') ?? '').slice(0, 32)));
};
