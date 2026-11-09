import { describe, expect, it } from 'vitest';
import { safeNext } from './auth-helpers.ts';

describe('safeNext', () => {
	it('keeps same-site paths', () => {
		expect(safeNext('/')).toBe('/');
		expect(safeNext('/library?view=shelves')).toBe('/library?view=shelves');
		expect(safeNext('/l/abc#x')).toBe('/l/abc#x');
	});
	it('rejects anything that leaves the site', () => {
		for (const bad of ['//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com', 'evil.com', '/\t/evil.com', '/%0a', null, undefined, '']) {
			expect(safeNext(bad as string, '/home'), String(bad)).toBe(bad === '/%0a' ? '/%0a' : '/home');
		}
	});
});
