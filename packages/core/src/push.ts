/**
 * Web Push endpoints come from the browser, i.e. from the user: the server later POSTs to them.
 * Only the push services browsers actually use are accepted, so a made-up subscription can't
 * point our server at an internal address.
 */
const PUSH_HOSTS = [
	'fcm.googleapis.com', // Chrome, Edge on Android, Samsung, Brave, Opera, Vivaldi
	'android.googleapis.com',
	'push.services.mozilla.com', // Firefox
	'notify.windows.com', // Edge
	'push.apple.com' // Safari
];

export function isPushEndpoint(endpoint: string): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
	const host = url.hostname.toLowerCase();
	return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
