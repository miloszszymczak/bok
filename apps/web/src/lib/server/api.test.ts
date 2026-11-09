import { describe, expect, it } from 'vitest';
import { Forbidden, NotFound } from '@bok/server';
import { guard } from './api.ts';

const status = async (fn: () => Promise<unknown>) => {
	try {
		await guard(fn);
		return 200;
	} catch (e) {
		return (e as { status?: number }).status ?? 500;
	}
};

describe('guard', () => {
	it('maps service errors and malformed-id database errors to 4xx', async () => {
		expect(await status(async () => 'ok')).toBe(200);
		expect(await status(async () => { throw new Forbidden(); })).toBe(403);
		expect(await status(async () => { throw new NotFound(); })).toBe(404);
		// Drizzle wraps postgres errors: invalid uuid syntax (22P02) on a URL id is "not found", not a crash.
		expect(await status(async () => { throw Object.assign(new Error('Failed query'), { cause: { code: '22P02' } }); })).toBe(404);
		expect(await status(async () => { throw new Error('boom'); })).toBe(500);
	});
});
