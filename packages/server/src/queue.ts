import { PgBoss } from 'pg-boss';

export const QUEUES = {
	coverMirror: 'cover-mirror',
	coverSweep: 'cover-sweep',
	readingStuck: 'reading-stuck',
	accountPurge: 'account-purge'
} as const;

export interface JobPayloads {
	[QUEUES.coverMirror]: { editionId: string };
	[QUEUES.coverSweep]: Record<string, never>;
	[QUEUES.readingStuck]: Record<string, never>;
	[QUEUES.accountPurge]: Record<string, never>;
}

export type QueueName = keyof JobPayloads;

export interface Queue {
	boss: PgBoss;
	send<Q extends QueueName>(name: Q, data: JobPayloads[Q], opts?: { singletonKey?: string; startAfter?: number }): Promise<string | null>;
}

/** Web uses a send-only instance (no maintenance, no cron); the worker runs the full one. */
export async function createQueue(databaseUrl: string, role: 'web' | 'worker'): Promise<Queue> {
	const boss = new PgBoss({
		connectionString: databaseUrl,
		max: role === 'web' ? 2 : 6,
		application_name: `bok-${role}-queue`,
		...(role === 'web' ? { supervise: false, schedule: false } : {})
	});
	boss.on('error', (e: unknown) => console.error('pg-boss', e));
	await boss.start();
	for (const q of Object.values(QUEUES)) {
		if (!(await boss.getQueue(q))) await boss.createQueue(q, { retryLimit: 3, retryBackoff: true });
	}
	return {
		boss,
		send: (name, data, opts) => boss.send(name, data, { singletonKey: opts?.singletonKey, startAfter: opts?.startAfter })
	};
}
