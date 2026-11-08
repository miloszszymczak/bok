import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ServerConfig } from './config.ts';

export interface Storage {
	put(key: string, body: Uint8Array | Buffer, contentType: string, cacheControl?: string): Promise<void>;
	get(key: string): Promise<{ body: ReadableStream; contentType?: string; etag?: string; length?: number } | null>;
	delete(key: string): Promise<void>;
	presignPut(key: string, contentType: string, expiresSec?: number): Promise<string>;
	/** Browser-facing URL for a stored key (custom R2 domain, or the app's /media proxy). */
	url(key: string): string;
}

export const IMMUTABLE = 'public, max-age=31536000, immutable';

export function createStorage(cfg: ServerConfig['r2']): Storage {
	const s3 = new S3Client({
		region: 'auto',
		endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
		credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
	});
	const full = (key: string) => cfg.prefix + key;
	return {
		async put(key, body, contentType, cacheControl = IMMUTABLE) {
			await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: full(key), Body: body, ContentType: contentType, CacheControl: cacheControl }));
		},
		async get(key) {
			try {
				const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: full(key) }));
				if (!r.Body) return null;
				return { body: r.Body.transformToWebStream(), contentType: r.ContentType, etag: r.ETag, length: r.ContentLength };
			} catch (e) {
				if ((e as { name?: string }).name === 'NoSuchKey') return null;
				throw e;
			}
		},
		async delete(key) {
			await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: full(key) }));
		},
		presignPut(key, contentType, expiresSec = 300) {
			return getSignedUrl(s3, new PutObjectCommand({ Bucket: cfg.bucket, Key: full(key), ContentType: contentType, CacheControl: IMMUTABLE }), {
				expiresIn: expiresSec
			});
		},
		url(key) {
			return cfg.publicUrl ? `${cfg.publicUrl}/${full(key)}` : `/media/${key}`;
		}
	};
}
