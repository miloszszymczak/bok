import { profiles } from '@bok/db';
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/auth/sign-in?next=${encodeURIComponent(url.pathname + url.search)}`);
	const { loans, db } = locals.svc;
	const withHandle = url.searchParams.get('with');
	let withUser: { userId: string; handle: string; displayName: string } | null = null;
	if (withHandle) {
		const p = await db.query.profiles.findFirst({ where: eq(profiles.handle, withHandle), columns: { userId: true, handle: true, displayName: true } });
		if (!p) error(404, 'Not found');
		withUser = p;
	}
	const [overview, history] = await Promise.all([
		loans.overview(locals.user.id, { withUserId: withUser?.userId }),
		loans.history(locals.user.id, { withUserId: withUser?.userId })
	]);
	return { ...overview, history, withUser };
};
