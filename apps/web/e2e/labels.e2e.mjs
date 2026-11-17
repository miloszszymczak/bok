/**
 * Shelf labels + hardware scanners: printable Code 128 labels, scanning a label switches the
 * scan target / moves the inventory on / opens the shelf, assigning an existing barcode, and a
 * USB/Bluetooth scanner (keyboard wedge: fast keys + Enter) on the Scan screen and app-wide.
 * Needs the dev server; the ISBN must already be catalogued (run scan.e2e first).
 *
 *   node apps/web/e2e/labels.e2e.mjs        Env: BASE_URL, CHROME, OUT
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const B = process.env.BASE_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const SAP = '9788375780635';

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' };
let failed = false;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || (failed = true));
const errors = [];

/** What a USB/Bluetooth scanner does: types the code very fast and presses Enter. */
async function wedge(page, code) {
	await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
	await page.keyboard.type(code, { delay: 4 });
	await page.keyboard.press('Enter');
}

try {
	const ctx = await browser.newContext(device);
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(B + '/auth/sign-up', { waitUntil: 'networkidle' });
	await page.fill('#name', 'Etykieta');
	await page.fill('#email', `delivered+labels${Date.now()}@resend.dev`);
	await page.fill('#password', 'correct-horse-battery');
	await page.check('input[name=terms]');
	await Promise.all([page.waitForURL(B + '/'), page.click('form button.btn-primary')]);

	// ── A room and a default bookcase ──
	await page.goto(B + '/library?view=shelves', { waitUntil: 'networkidle' });
	await page.fill('input[name=name]', 'Gabinet');
	await Promise.all([page.waitForURL(/\/library\/r\//), page.click('form button:has-text("Dodaj pokój")')]);
	await Promise.all([page.waitForURL(/\/library\/c\/new/), page.click('a:has-text("Dodaj regał")')]);
	await page.waitForLoadState('networkidle');
	await page.fill('#name', 'Regał');
	await Promise.all([page.waitForURL(/\/library\/c\/[0-9a-f-]+$/), page.click('button:has-text("Utwórz regał")')]);
	const shelfCount = await page.locator('svg g[role=button]').count();

	// ── Printable labels ──
	await Promise.all([page.waitForURL(/\/library\/labels\?container=/), page.click('[data-testid=bookcase-labels]')]);
	const labels = await page.$$eval('[data-testid=labels] li', (els) => els.map((e) => ({ code: e.dataset.code, section: e.dataset.section, label: e.dataset.label })));
	check(labels.length === shelfCount && labels.every((l) => /^BOK-[0-9A-Z]{6}$/.test(l.code)), `one label per shelf (${labels.length}/${shelfCount}), all BOK codes`);
	check((await page.locator('[data-testid=labels] svg rect').count()) > labels.length * 20, 'labels carry barcodes');
	await page.screenshot({ path: join(out, 'labels.png'), fullPage: true });
	await page.reload({ waitUntil: 'networkidle' });
	const again = await page.$$eval('[data-testid=labels] li', (els) => els.map((e) => e.dataset.code));
	check(JSON.stringify(again) === JSON.stringify(labels.map((l) => l.code)), 'printing again keeps the same codes');
	const [s0, s1] = labels;

	// ── Scan screen: a hardware scanner switches shelves and adds books ──
	await page.goto(B + '/scan', { waitUntil: 'networkidle' });
	await page.waitForSelector('[data-testid=scan-target]');
	await wedge(page, s1.code);
	await page.waitForSelector('[data-testid=scan-notice]');
	check((await page.textContent('[data-testid=target-label]'))?.trim() === s1.label, `label scan switched the target to ${s1.label}`);
	check(await page.isVisible('[data-testid=wedge-badge]'), 'scanner badge shown');
	await wedge(page, SAP);
	const st = await page.waitForSelector(`li[data-code="${SAP}"]:not([data-status=queued]):not([data-status=sending])`).then((el) => el.getAttribute('data-status'));
	check(st === 'added', `scanner-typed ISBN added (${st})`);
	await page.screenshot({ path: join(out, 'scan-wedge.png') });

	// ── The camera reads printed labels too (native detector where available, and the WASM decoder) ──
	const video = join(out, 'label.y4m');
	execFileSync('node', [fileURLToPath(new URL('./make-video.mjs', import.meta.url)), video, JSON.stringify([[null, 2, 0], [s0.code, 3, 1], [null, 60, 0]])]);
	const state = await ctx.storageState();
	for (const engine of ['default', 'zxing']) {
		const camBrowser = await chromium.launch({
			executablePath: process.env.CHROME || undefined,
			args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`]
		});
		const camCtx = await camBrowser.newContext({ ...device, storageState: state, permissions: ['camera'] });
		const cam = await camCtx.newPage();
		cam.on('pageerror', (e) => errors.push(`camera: ${e.message}`));
		await cam.goto(B + '/scan?debug', { waitUntil: 'networkidle' });
		await cam.evaluate((e) => (e === 'zxing' ? localStorage.setItem('scanner-engine', 'zxing') : localStorage.removeItem('scanner-engine')), engine);
		await cam.reload({ waitUntil: 'networkidle' });
		await cam.click('button:has-text("Włącz aparat")');
		const ok = await cam.waitForFunction((l) => document.querySelector('[data-testid=target-label]')?.textContent?.trim() === l, s0.label, { timeout: 20_000 }).then(() => true, () => false);
		const used = await cam.textContent('p.font-mono').catch(() => '?');
		check(ok, `camera (${engine}: ${used}) read the printed label and switched to ${s0.label}`);
		if (engine === 'zxing') await cam.screenshot({ path: join(out, 'scan-camera-label.png') });
		await camBrowser.close();
	}

	// ── Inventory moves on to the next shelf when its label is scanned ──
	await page.goto(`${B}/scan?inventory=${s1.section}`, { waitUntil: 'networkidle' });
	await page.waitForSelector('[data-testid=inventory]');
	await page.waitForFunction(() => !document.querySelector('[data-testid=inventory-finish]')?.hasAttribute('disabled'));
	await wedge(page, SAP);
	await page.waitForSelector('[data-testid=inv-confirmed]:has-text("1")');
	await wedge(page, s0.code);
	await page.waitForURL((u) => u.searchParams.get('inventory') === s0.section);
	check(true, 'label scan moved the inventory to the next shelf');
	await page.goto(`${B}/library/s/${s1.section}`, { waitUntil: 'networkidle' });
	check((await page.textContent('main'))?.includes('Ostatnia inwentaryzacja'), 'the previous shelf’s inventory was saved');

	// ── Assign an existing barcode ──
	const sticker = `SHELF-${Date.now().toString(36).toUpperCase()}`;
	await page.goto(`${B}/library/s/${s0.section}`, { waitUntil: 'networkidle' });
	await Promise.all([page.waitForURL(/\/scan\?assign=/), page.click('[data-testid=assign-label]')]);
	await page.waitForSelector('[data-testid=assign-panel]');
	await page.fill('[data-testid=assign-input]', sticker.toLowerCase());
	await page.press('[data-testid=assign-input]', 'Enter');
	await page.waitForURL(`${B}/library/s/${s0.section}`);
	check((await page.textContent('[data-testid=shelf-code]'))?.trim() === sticker, `existing code assigned (${sticker})`);
	await page.screenshot({ path: join(out, 'shelf-label.png'), fullPage: true });
	await page.goto(`${B}/scan?assign=${s1.section}`, { waitUntil: 'networkidle' });
	await page.waitForSelector('[data-testid=assign-panel]');
	await wedge(page, sticker);
	await page.waitForSelector('[data-testid=scan-notice]');
	check((await page.textContent('[data-testid=scan-notice]'))?.includes(s0.label), 'a code used by another shelf is refused, naming that shelf');
	await wedge(page, SAP);
	await page.waitForSelector('[data-testid=scan-notice]:has-text("kod książki")');
	check(true, 'a book barcode is refused as a label');

	// ── Anywhere in the app ──
	await page.goto(B + '/library', { waitUntil: 'networkidle' });
	await wedge(page, sticker);
	await page.waitForURL(`${B}/library/s/${s0.section}`);
	check(true, 'scanner on the library page opens the labelled shelf');
	await wedge(page, SAP);
	await page.waitForURL(/\/book\//);
	check(true, 'scanner on another page opens the scanned book');
	// Typing in a field is left alone.
	await page.goto(B + '/search', { waitUntil: 'networkidle' });
	await page.click('input[name=q]');
	await page.keyboard.type(sticker, { delay: 4 });
	await page.keyboard.press('Enter');
	await page.waitForLoadState('networkidle');
	check(page.url().startsWith(B + '/search'), 'scanning into a text field just types into it');

	check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
	await ctx.close();
} catch (e) {
	console.error(e);
	failed = true;
} finally {
	await browser.close();
	console.log(`screenshots: ${out}`);
	process.exit(failed ? 1 : 0);
}
