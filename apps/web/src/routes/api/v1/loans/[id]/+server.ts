import { error, json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/api.ts';
import { dateOrNull, loanGuard, str } from '#lib/server/loans-api.ts';
import type { RequestHandler } from './$types';

/** POST { action } — approve (dueOn) · decline · cancel · extend (to) · extension (approve) · returned · dispute · edit (dueOn, note) · remove */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = await requireUser(locals, { key: 'loans', max: 120, windowSec: 60 });
	const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!b) error(400);
	const { loans } = locals.svc;
	const id = params.id;
	const result = await loanGuard(async () => {
		switch (b.action) {
			case 'approve':
				return loans.approve(user.id, id, dateOrNull(b.dueOn));
			case 'decline':
				return loans.decline(user.id, id);
			case 'cancel':
				return loans.cancel(user.id, id);
			case 'extend':
				return loans.extend(user.id, id, str(b.to) ?? '');
			case 'extension':
				return loans.answerExtension(user.id, id, b.approve === true);
			case 'returned':
				return loans.markReturned(user.id, id);
			case 'dispute':
				return loans.disputeReturn(user.id, id);
			case 'edit':
				return loans.edit(user.id, id, { dueOn: 'dueOn' in b ? dateOrNull(b.dueOn) : undefined, note: str(b.note) });
			case 'remove':
				return loans.remove(user.id, id);
		}
		error(400, 'unknown action');
	});
	return json({ ok: true, result: result ?? null });
};
