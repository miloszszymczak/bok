import { error } from '@sveltejs/kit';
import { guard, UUID } from '#lib/server/api.ts';
import type { PageServerLoad } from './$types';

/** Printable shelf labels: ?section=, ?container=, or every shelf in the household. Missing codes are generated. */
export const load: PageServerLoad = async ({ url, locals }) => {
	const section = url.searchParams.get('section');
	const container = url.searchParams.get('container');
	if ((section && !UUID.test(section)) || (container && !UUID.test(container))) error(404);
	const labels = await guard(() => locals.svc.shelves.labels(locals.user!.id, { sectionId: section ?? undefined, containerId: container ?? undefined }));
	const back = section ? `/library/s/${section}` : container ? `/library/c/${container}` : '/library?view=shelves';
	return { labels, back };
};
