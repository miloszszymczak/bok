import { ORIGIN } from '$app/env/private';
import { error } from '@sveltejs/kit';
import { UUID } from '#lib/server/api.ts';
import { ogVersion } from '#lib/server/og-version.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID.test(params.id)) error(404);
	const viewer = locals.user?.id ?? null;
	const post = await locals.svc.posts.get(viewer, params.id);
	if (!post) error(404, 'Not found');
	const [comments, preview] = await Promise.all([locals.svc.posts.comments(viewer, params.id), locals.svc.posts.preview(params.id)]);
	return {
		post,
		comments,
		og: preview
			? { url: `${ORIGIN}/p/${post.id}`, image: `${ORIGIN}/og/p/${post.id}.png?v=${ogVersion([post.body, post.spoiler, post.editedAt, post.author.avatar])}`, text: preview.text, spoiler: preview.spoiler }
			: null
	};
};
