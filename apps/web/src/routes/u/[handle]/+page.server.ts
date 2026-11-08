import { copies, householdMembers, profiles } from '@bok/db';
import { error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { avatarUrl } from '#lib/server/media.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { db, storage } = locals.svc;
	const p = await db.query.profiles.findFirst({ where: eq(profiles.handle, params.handle) });
	if (!p || p.deletionRequestedAt) error(404, 'Not found');
	const [count] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(copies)
		.where(sql`${copies.householdId} in (select ${householdMembers.householdId} from ${householdMembers} where ${householdMembers.userId} = ${p.userId})`);
	return {
		person: {
			handle: p.handle,
			displayName: p.displayName,
			bio: p.bio,
			avatarUrl: avatarUrl(storage, p.avatarKey),
			joined: p.createdAt.toISOString(),
			isMe: locals.user?.id === p.userId
		},
		bookCount: count?.n ?? 0
	};
};
