import { comments, posts, readlists } from '@bok/db';
import { REPORT_REASONS, type ReportTarget } from '@bok/server';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { guard, requireUser, UUID } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

/** POST { targetType: post|comment|readlist, targetId, reason, details? } */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'report', max: 20, windowSec: 3600 });
	const b = (await request.json().catch(() => null)) as { targetType?: unknown; targetId?: unknown; reason?: unknown; details?: unknown } | null;
	const type = b?.targetType as ReportTarget;
	if (!['post', 'comment', 'readlist'].includes(type) || typeof b?.targetId !== 'string' || !UUID.test(b.targetId)) error(400, 'invalid target');
	if (!REPORT_REASONS.includes(b.reason as (typeof REPORT_REASONS)[number])) error(400, 'invalid reason');
	const { db } = locals.svc;
	const id = b.targetId;
	const owner =
		type === 'post'
			? (await db.query.posts.findFirst({ where: eq(posts.id, id), columns: { authorId: true } }))?.authorId
			: type === 'comment'
				? (await db.query.comments.findFirst({ where: eq(comments.id, id), columns: { authorId: true } }))?.authorId
				: (await db.query.readlists.findFirst({ where: eq(readlists.id, id), columns: { ownerId: true } }))?.ownerId;
	if (!owner) error(404, 'not found');
	await guard(() => locals.svc.social.report(user.id, { targetType: type, targetId: id, targetUserId: owner, reason: b.reason as (typeof REPORT_REASONS)[number], details: typeof b.details === 'string' ? b.details : '' }));
	return json({ ok: true });
};
