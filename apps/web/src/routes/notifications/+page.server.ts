import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { notifications, storage } = locals.svc;
	const items = await notifications.list(locals.user!.id);
	return {
		items: items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null, actorAvatar: n.actorAvatar ? storage.url(n.actorAvatar) : null }))
	};
};

export const actions: Actions = {
	read: async ({ locals }) => {
		await locals.svc.notifications.markRead(locals.user!.id);
	}
};
