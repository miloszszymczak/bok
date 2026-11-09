/** Web push on this device. iOS only allows it in the installed (home-screen) app. */
function urlBase64ToUint8Array(base64: string) {
	const pad = '='.repeat((4 - (base64.length % 4)) % 4);
	const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export async function currentSubscription() {
	if (!pushSupported()) return null;
	const reg = await navigator.serviceWorker.ready;
	return reg.pushManager.getSubscription();
}

export async function enablePush(publicKey: string) {
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') return { ok: false as const, reason: perm };
	const reg = await navigator.serviceWorker.ready;
	const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
	const res = await fetch('/api/v1/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
	return res.ok ? { ok: true as const } : { ok: false as const, reason: 'server' };
}

export async function disablePush() {
	const sub = await currentSubscription();
	if (!sub) return;
	await fetch('/api/v1/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
	await sub.unsubscribe();
}
