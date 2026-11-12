import { describe, expect, it } from 'vitest';
import { isPushEndpoint } from './push.ts';

describe('isPushEndpoint', () => {
	it('accepts the browsers\' push services', () => {
		for (const u of [
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://updates.push.services.mozilla.com/wpush/v2/abc',
			'https://web.push.apple.com/abc',
			'https://wns2-par02p.notify.windows.com/w/?token=abc'
		])
			expect(isPushEndpoint(u), u).toBe(true);
	});
	it('rejects anything else', () => {
		for (const u of [
			'http://fcm.googleapis.com/fcm/send/abc',
			'https://postgres.default.svc.cluster.local/',
			'https://10.0.0.1/',
			'https://fcm.googleapis.com.evil.example/x',
			'https://evilfcm.googleapis.com.example/x',
			'https://user:pw@fcm.googleapis.com/x',
			'https://fcm.googleapis.com:8443/x',
			'not a url'
		])
			expect(isPushEndpoint(u), u).toBe(false);
	});
});
