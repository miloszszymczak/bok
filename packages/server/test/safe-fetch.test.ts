import { describe, expect, it } from 'vitest';
import { checkUrl, fetchImageSafely, isPrivateAddress, UnsafeUrl } from '../src/safe-fetch.ts';

describe('safe image fetch', () => {
	it('classifies addresses', () => {
		for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1'])
			expect(isPrivateAddress(ip), ip).toBe(true);
		for (const ip of ['8.8.8.8', '151.101.1.69', '172.32.0.1', '2606:4700::6810:84e5', '::ffff:8.8.8.8']) expect(isPrivateAddress(ip), ip).toBe(false);
	});
	it('refuses unsafe URLs before connecting', () => {
		for (const u of ['file:///etc/passwd', 'ftp://example.com/a.jpg', 'http://127.0.0.1/a.jpg', 'http://[::1]/a.jpg', 'http://169.254.169.254/latest', 'https://user:pw@example.com/a.jpg', 'https://example.com:8443/a.jpg', 'http://localhost/a.jpg', 'http://postgres/a.jpg', 'http://bok-web.default.svc.cluster.internal/x', 'not a url'])
			expect(() => checkUrl(u), u).toThrow(UnsafeUrl);
		expect(checkUrl('https://covers.openlibrary.org/b/id/1-L.jpg').hostname).toBe('covers.openlibrary.org');
		expect(checkUrl('http://books.google.com/books/content?id=x').protocol).toBe('http:');
	});
	it('blocks names that resolve to private addresses at connect time', async () => {
		// localtest.me and its subdomains resolve to 127.0.0.1 (public DNS).
		await expect(fetchImageSafely('http://img.localtest.me/a.jpg', { maxBytes: 1000, timeoutMs: 3000 })).rejects.toThrow(/blocked address|ENOTFOUND|EAI_AGAIN/);
	});
});
