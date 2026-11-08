import { METRICS_TOKEN } from '$app/env/private';
import { registry } from '@bok/server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	if (METRICS_TOKEN && request.headers.get('authorization') !== `Bearer ${METRICS_TOKEN}`) return new Response('forbidden', { status: 403 });
	return new Response(await registry.metrics(), { headers: { 'content-type': registry.contentType } });
};
