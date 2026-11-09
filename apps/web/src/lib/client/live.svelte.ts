/** Live unread-notification count, fed by /api/v1/events (SSE). */
export const live = $state({ unread: 0 });

let source: EventSource | null = null;

export function connectLive(initial: number) {
	live.unread = initial;
	if (source || typeof EventSource === 'undefined') return;
	source = new EventSource('/api/v1/events');
	source.addEventListener('unread', (e) => (live.unread = Number((e as MessageEvent).data) || 0));
}

export function disconnectLive() {
	source?.close();
	source = null;
}
