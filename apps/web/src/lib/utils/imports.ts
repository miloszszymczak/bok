import { m } from '#lib/paraglide/messages.js';

export const importStatusLabel = (s: string) =>
	s === 'preview' ? m.import_status_preview() : s === 'queued' || s === 'running' ? m.import_status_running() : s === 'done' ? m.import_status_done() : s === 'failed' ? m.import_status_failed() : m.import_status_cancelled();
