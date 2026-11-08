import { Cluster, Valkey } from 'iovalkey';
import type { ServerConfig } from './config.ts';

export type Kv = Valkey | Cluster;

/**
 * Single node (VALKEY_URL) or cluster mode (VALKEY_CLUSTER_NODES=host:port,host:port).
 * Credentials: VALKEY_USERNAME (ACL user, optional) + VALKEY_PASSWORD; they override any in the URL.
 * Keys are prefixed with `bok:`; multi-key operations must share a {hash tag}.
 */
export function createValkey(cfg: ServerConfig['valkey']): Kv {
	const common = { keyPrefix: 'bok:', lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: true };
	if (cfg.clusterNodes) {
		return new Cluster(
			cfg.clusterNodes.map((n) => {
				const [host, port] = n.split(':');
				return { host: host!, port: Number(port ?? 6379) };
			}),
			{ keyPrefix: common.keyPrefix, redisOptions: { username: cfg.username, password: cfg.password, maxRetriesPerRequest: 2 } }
		);
	}
	return new Valkey(cfg.url ?? 'redis://localhost:6379', { ...common, username: cfg.username, password: cfg.password });
}

/** Sliding-ish fixed window rate limit. Returns true when the call is allowed. */
export async function rateLimit(kv: Kv, key: string, max: number, windowSec: number): Promise<boolean> {
	const k = `rl:${key}`;
	const n = await kv.incr(k);
	if (n === 1) await kv.expire(k, windowSec);
	return n <= max;
}
