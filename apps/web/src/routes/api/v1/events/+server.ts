import { ensureListening, onUser } from '#lib/server/live.ts';
import type { RequestHandler } from './$types';

/** Server-sent events: `unread` count whenever my notifications change. */
export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('unauthorized', { status: 401 });
	const userId = locals.user.id;
	const { notifications } = locals.svc;
	await ensureListening(locals.svc);
	const enc = new TextEncoder();
	let cleanup = () => {};
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = async () => {
				try {
					controller.enqueue(enc.encode(`event: unread\ndata: ${await notifications.unread(userId)}\n\n`));
				} catch {
					cleanup();
				}
			};
			const off = onUser(userId, () => void send());
			const beat = setInterval(() => {
				try {
					controller.enqueue(enc.encode(`: keep-alive\n\n`));
				} catch {
					cleanup();
				}
			}, 25_000);
			cleanup = () => {
				off();
				clearInterval(beat);
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};
			request.signal.addEventListener('abort', () => cleanup());
			controller.enqueue(enc.encode(`retry: 5000\n\n`));
			await send();
		},
		cancel() {
			cleanup();
		}
	});
	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' }
	});
};
