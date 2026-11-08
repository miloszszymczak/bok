import { createServer } from 'node:http';
import { configFromEnv, createServices, log, QUEUES, registry } from '@bok/server';
import { sql } from 'drizzle-orm';
import { mirrorCover } from './jobs/cover-mirror.ts';

const svc = await createServices(configFromEnv(), 'worker');
const { boss } = svc.queue;

await boss.work<{ editionId: string }>(QUEUES.coverMirror, { batchSize: 4 }, async (jobs) => {
	await Promise.all(jobs.map((j) => mirrorCover(svc, j.data.editionId)));
});

// Re-enqueue covers whose job never got sent (e.g. queue hiccup right after the DB commit).
await boss.work(QUEUES.coverSweep, async () => {
	const stale = await svc.db.execute<{ id: string }>(
		sql`select id from editions where cover_status = 'pending' and updated_at < now() - interval '10 minutes' limit 200`
	);
	for (const { id } of stale) await svc.queue.send(QUEUES.coverMirror, { editionId: id }, { singletonKey: id });
});
await boss.schedule(QUEUES.coverSweep, '*/10 * * * *', {});

// Reading with no progress for 30 days → stuck (auto).
await boss.work(QUEUES.readingStuck, async () => {
	const n = await svc.reading.markStuck();
	if (n) log.info({ n }, 'marked reads as stuck');
});
await boss.schedule(QUEUES.readingStuck, '30 4 * * *', {}, { tz: 'Europe/Warsaw' });

await boss.work(QUEUES.accountPurge, async () => {
	const n = await svc.accounts.purgeDue();
	if (n) log.info({ n }, 'purged deleted accounts');
});
await boss.schedule(QUEUES.accountPurge, '15 3 * * *', {}, { tz: 'Europe/Warsaw' });

// Probes + metrics for Kubernetes / Prometheus.
const port = Number(process.env.WORKER_PORT ?? 9091);
const server = createServer(async (req, res) => {
	if (req.url === '/healthz') return void res.end('ok');
	if (req.url === '/metrics') {
		res.setHeader('content-type', registry.contentType);
		return void res.end(await registry.metrics());
	}
	res.statusCode = 404;
	res.end();
}).listen(port, () => log.info({ port }, 'worker started'));

async function shutdown(signal: string) {
	log.info({ signal }, 'worker stopping');
	server.close();
	await svc.close();
	process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
