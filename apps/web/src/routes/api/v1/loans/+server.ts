import { error, json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import { dateOrNull, loanGuard, str, userIdByHandle } from '#lib/server/loans-api.ts';
import type { RequestHandler } from './$types';

/**
 * POST — start a loan:
 *   { kind: 'lend', copyId, borrower?: handle, borrowerName?, dueOn?, note? }   my copy → someone
 *   { kind: 'borrowed', workId, editionId?, lenderName, dueOn?, note? }         borrowed from outside the app
 *   { kind: 'request', copyId, note? }                                          ask to borrow
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = await requireUser(locals, { key: 'loans', max: 60, windowSec: 60 });
	const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!b) error(400);
	const { loans } = locals.svc;
	const id = await loanGuard(async () => {
		if (b.kind === 'lend')
			return loans.lend(user.id, { copyId: str(b.copyId) ?? '', borrowerId: await userIdByHandle(locals, b.borrower), borrowerName: str(b.borrowerName), dueOn: dateOrNull(b.dueOn), note: str(b.note) });
		if (b.kind === 'borrowed')
			return loans.recordBorrow(user.id, { workId: str(b.workId) ?? '', editionId: str(b.editionId) ?? null, lenderName: str(b.lenderName) ?? '', dueOn: dateOrNull(b.dueOn), note: str(b.note) });
		if (b.kind === 'request') return loans.request(user.id, str(b.copyId) ?? '', str(b.note));
		error(400, 'unknown kind');
	});
	return json({ id }, { status: 201 });
};
