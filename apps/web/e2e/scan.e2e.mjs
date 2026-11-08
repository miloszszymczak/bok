/**
 * End-to-end scanner test with a fake camera feed. Needs the dev server (npm run dev) with a
 * catalogue that already knows the ISBNs below (they resolve via BN / Open Library on first use).
 *
 *   node apps/web/e2e/scan.e2e.mjs            # native BarcodeDetector when the browser has one
 *   ENGINE=zxing node apps/web/e2e/scan.e2e.mjs   # force the WASM decoder (the iOS path)
 *
 * Env: BASE_URL (default http://localhost:5173), CHROME (browser binary), OUT (screenshot dir).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const B = process.env.BASE_URL ?? 'http://localhost:5173';
const dir = mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const out = process.env.OUT ?? dir;
mkdirSync(out, { recursive: true });
const video = join(dir, 'shelf.y4m');

// 3s nothing → Sapkowski held 4s (must add once) → Tolkien → Heller → a product EAN (ignored) → Sapkowski again (duplicate).
const SAP = '9788375780635', HOB = '9780547928227', HEL = '9788378865759';
execFileSync('node', [fileURLToPath(new URL('./make-video.mjs', import.meta.url)), video, JSON.stringify([[null, 3, 0], [SAP, 4, 1.5], [HOB, 2, 1.5], [HEL, 2, 1.5], ['5901234123457', 2, 1.5], [SAP, 2, 1.5], [null, 40, 0]])]);

const browser = await chromium.launch({
	executablePath: process.env.CHROME || undefined,
	args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`]
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL', permissions: ['camera'] });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
let failed = false;
const check = (ok, label) => {
	console.log(`${ok ? '✓' : '✗'} ${label}`);
	if (!ok) failed = true;
};
const statuses = () => page.$$eval('li[data-status]', (els) => els.map((e) => `${e.dataset.status}:${e.dataset.code}`));

try {
	await page.goto(B + '/auth/sign-up', { waitUntil: 'networkidle' });
	await page.fill('#name', 'Scanner Test');
	await page.fill('#email', `delivered+scan${Date.now()}@resend.dev`);
	await page.fill('#password', 'correct-horse-battery');
	await page.check('input[name=terms]');
	await Promise.all([page.waitForURL(B + '/'), page.click('button[type=submit], form button.btn-primary')]);

	await page.goto(B + '/scan?debug', { waitUntil: 'networkidle' });
	if (process.env.ENGINE === 'zxing') {
		await page.evaluate(() => localStorage.setItem('scanner-engine', 'zxing'));
		await page.reload({ waitUntil: 'networkidle' });
	}
	await page.click('button:has-text("Włącz aparat")');
	await page.waitForTimeout(26_000);
	await page.screenshot({ path: join(out, 'scan-session.png') });
	const engine = await page.textContent('p.font-mono').catch(() => '?');
	const got = await statuses();
	check(JSON.stringify(got) === JSON.stringify([`duplicate:${SAP}`, `added:${HEL}`, `added:${HOB}`, `added:${SAP}`]), `camera sweep (${engine}): ${got.join(' ')}`);

	await page.click('li[data-status=duplicate] button:has-text("Dodaj kolejny")');
	await page.waitForFunction((c) => document.querySelectorAll(`li[data-status=added][data-code="${c}"]`).length === 2, SAP);
	check(true, 'duplicate → add another copy');
	await page.locator(`li[data-status=added][data-code="${SAP}"]`).first().locator('button:has-text("Cofnij")').click();
	await page.waitForSelector('li[data-status=undone]');
	check(true, 'undo');

	await page.click('button:has-text("Wpisz")');
	await ctx.setOffline(true);
	await page.fill('input[inputmode=numeric]', '9788382251586');
	await page.press('input[inputmode=numeric]', 'Enter');
	await page.waitForSelector('li[data-code="9788382251586"][data-status=queued]');
	await page.waitForTimeout(1000);
	check((await page.getAttribute('li[data-code="9788382251586"]', 'data-status')) === 'queued', 'offline scan stays queued');
	await ctx.setOffline(false);
	await page.waitForSelector('li[data-code="9788382251586"][data-status=added]', { timeout: 15_000 });
	check(true, 'queued scan synced after reconnect');

	await page.click('button[role=tab]:has-text("Sprawdź")');
	await ctx.setOffline(true);
	for (const [code, want] of [[HOB, 'owned'], ['9788378865162', 'not-owned']]) {
		await page.fill('input[inputmode=numeric]', code);
		const t = Date.now();
		await page.press('input[inputmode=numeric]', 'Enter');
		await page.waitForFunction(([c]) => document.querySelector('section[data-verdict]')?.textContent?.includes(c === '9780547928227' ? 'The Hobbit' : c), [code]);
		const ms = Date.now() - t;
		const v = await page.getAttribute('section[data-verdict]', 'data-verdict');
		check(v === want && ms < 300, `bookstore offline ${code}: ${v} in ${ms}ms`);
	}
	await page.screenshot({ path: join(out, 'bookstore-offline.png') });
	await ctx.setOffline(false);
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors) : ''}`);
	console.log(`screenshots: ${out}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
