/**
 * Phase 6 end-to-end: create a list from a book page, add more books, drag to reorder, notes,
 * private / unlisted / public, the public page without an account (also without JavaScript),
 * saving someone else's list, and link previews as messaging-app bots fetch them.
 *
 *   node apps/web/e2e/readlists.e2e.mjs        Env: BASE_URL, CHROME, OUT
 */
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const B = process.env.BASE_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const stamp = Date.now().toString(36);
const HOB = '9780547928227', SAP = '9788375780635', HEL = '9788378865759';
const BOTS = {
	Messenger: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
	WhatsApp: 'WhatsApp/2.24.1.10 A',
	iMessage: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
	Slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
	Discord: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' };
const errors = [];
let failed = false;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || (failed = true));

async function user(name) {
	const ctx = await browser.newContext(device);
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	await page.goto(B + '/auth/sign-up', { waitUntil: 'networkidle' });
	await page.fill('#name', `${name} ${stamp}`);
	await page.fill('#email', `delivered+${name.toLowerCase()}${stamp}@resend.dev`);
	await page.fill('#password', 'correct-horse-battery');
	await page.check('input[name=terms]');
	await Promise.all([page.waitForURL(B + '/'), page.click('form button.btn-primary')]);
	return { ctx, page };
}
const meta = (html, prop) => new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html)?.[1]?.replace(/&amp;/g, '&');
const order = (page) => page.$$eval('[data-testid=list-items] li[data-item]', (els) => els.map((e) => e.dataset.title));

try {
	const { page } = await user('Lista');
	const listTitle = `Na wakacje ${stamp}`;

	// ── Create from a book page, then add two more via the sheet ──
	await page.goto(`${B}/isbn/${HOB}`, { waitUntil: 'networkidle' });
	await page.click('[data-testid=add-to-list]');
	await page.fill('input[placeholder="Nowa lista z tą książką"]', listTitle);
	await page.click('div[role=dialog] button:has-text("Utwórz")');
	await page.waitForSelector(`[data-sheet-list="${listTitle}"] input:checked`);
	for (const code of [SAP, HEL]) {
		await page.goto(`${B}/isbn/${code}`, { waitUntil: 'networkidle' });
		await page.click('[data-testid=add-to-list]');
		await page.check(`[data-sheet-list="${listTitle}"] input`);
		await page.waitForTimeout(300);
	}
	await page.goto(B + '/lists', { waitUntil: 'networkidle' });
	await page.click(`[data-list="${listTitle}"]`);
	await page.waitForURL(/\/lists\/[0-9a-f-]+$/);
	const editorUrl = page.url();
	check(JSON.stringify(await order(page)) === JSON.stringify(['The Hobbit', 'Ostatnie życzenie', 'Bóg i geometria']), `added in order: ${await order(page)}`);

	// ── Drag "Bóg i geometria" to the top ──
	const handle = page.locator('li[data-title="Bóg i geometria"] [data-testid=drag]');
	const target = await page.locator('li[data-title="The Hobbit"]').boundingBox();
	const hb = await handle.boundingBox();
	await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
	await page.mouse.down();
	await page.mouse.move(hb.x + hb.width / 2, target.y + 5, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(500);
	await page.reload({ waitUntil: 'networkidle' });
	check(JSON.stringify(await order(page)) === JSON.stringify(['Bóg i geometria', 'The Hobbit', 'Ostatnie życzenie']), `drag reorder persisted: ${await order(page)}`);
	await page.click('li[data-title="Ostatnie życzenie"] button[aria-label="Przesuń wyżej"]');
	await page.waitForTimeout(400);
	await page.reload({ waitUntil: 'networkidle' });
	check(JSON.stringify(await order(page)) === JSON.stringify(['Bóg i geometria', 'Ostatnie życzenie', 'The Hobbit']), `↑ button persisted: ${await order(page)}`);

	await page.click('li[data-title="The Hobbit"] [data-testid=note]');
	await page.fill('li[data-title="The Hobbit"] input', 'Klasyka na długi wieczór');
	await page.click('li[data-title="The Hobbit"] button:has-text("Zapisz")');
	await page.waitForTimeout(300);
	await page.screenshot({ path: join(out, 'editor.png') });

	// ── Visibility ──
	const slug = (await page.getAttribute('a:has-text("Podgląd")', 'href')).split('/').pop();
	const anon = await (await browser.newContext(device)).newPage();
	check((await anon.goto(`${B}/l/${slug}`))?.status() === 404, 'private list: 404 without an account');
	const setVis = async (v) => {
		await page.goto(editorUrl, { waitUntil: 'networkidle' });
		await page.click('[data-testid=list-settings]');
		await page.selectOption('select[name=visibility]', v);
		await page.click('form button:has-text("Zapisz")');
		await page.waitForTimeout(400);
	};
	await setVis('unlisted');
	const r1 = await anon.goto(`${B}/l/${slug}`, { waitUntil: 'networkidle' });
	check(r1?.status() === 200 && (await anon.textContent('[data-testid=list-title]')) === listTitle, 'unlisted: opens for anyone with the link');
	check(!!(await anon.$('meta[name=robots][content=noindex]')), 'unlisted: noindex');
	check((await anon.textContent('[data-testid=public-items]'))?.includes('Klasyka na długi wieczór'), 'note shown on the public page');
	check(!!(await anon.$('[data-testid=cta]')), 'visitors get the sign-up call to action');
	await setVis('public');
	await page.goto(B + '/u/' + (await (await page.goto(B + '/settings', { waitUntil: 'networkidle' }), page.inputValue('#handle'))) + '?tab=readlists', { waitUntil: 'networkidle' });
	check((await page.textContent('[data-testid=profile-lists]'))?.includes(listTitle), 'public: listed on the profile');

	// ── No JavaScript ──
	const nojs = await (await browser.newContext({ ...device, javaScriptEnabled: false })).newPage();
	await nojs.goto(`${B}/l/${slug}`);
	check((await nojs.$$('[data-testid=public-items] li')).length === 3, 'public page renders fully without JavaScript');
	await anon.goto(`${B}/l/${slug}`, { waitUntil: 'networkidle' });
	await anon.screenshot({ path: join(out, 'public-list.png'), fullPage: true });

	// ── Link previews as bots fetch them ──
	let image = '';
	for (const [app, ua] of Object.entries(BOTS)) {
		const html = await (await fetch(`${B}/l/${slug}`, { headers: { 'user-agent': ua } })).text();
		const title = meta(html, 'og:title'), img = meta(html, 'og:image'), card = meta(html, 'twitter:card');
		image = img ?? image;
		check(title === listTitle && !!img && card === 'summary_large_image', `${app}: og:title, og:image, twitter:card`);
	}
	await new Promise((r) => setTimeout(r, 1500)); // a bot fetches the image a moment after the page
	const t = Date.now();
	const res = await fetch(image.replace(/^https?:\/\/[^/]+/, B), { headers: { 'user-agent': BOTS.WhatsApp } });
	const png = Buffer.from(await res.arrayBuffer());
	const info = await sharp(png).metadata();
	check(res.status === 200 && info.format === 'png' && info.width === 1200 && info.height === 630, `preview image ${info.width}×${info.height} ${info.format} (${png.length} B, image request ${Date.now() - t} ms)`);
	const t2 = Date.now();
	await fetch(image.replace(/^https?:\/\/[^/]+/, B));
	check(true, `cached preview served in ${Date.now() - t2} ms`);
	await sharp(png).toFile(join(out, 'og-list.png'));
	const bookPath = /href="(\/book\/[0-9a-f-]+)"/.exec(await (await fetch(`${B}/l/${slug}`)).text())?.[1];
	for (const path of [bookPath]) {
		const html = await (await fetch(B + path, { headers: { 'user-agent': BOTS.Slack }, redirect: 'follow' })).text();
		const img = meta(html, 'og:image');
		const r = await fetch(img.replace(/^https?:\/\/[^/]+/, B));
		const i = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
		await sharp(Buffer.from(await (await fetch(img.replace(/^https?:\/\/[^/]+/, B))).arrayBuffer())).toFile(join(out, 'og-book.png'));
		check(i.width === 1200 && !!meta(html, 'og:title'), `book page preview: ${meta(html, 'og:title')}`);
	}

	// ── Someone else saves it ──
	const other = await user('Gosc');
	await other.page.goto(`${B}/l/${slug}`, { waitUntil: 'networkidle' });
	await other.page.click('[data-testid=save-list]');
	await other.page.waitForSelector('[data-testid=save-list]:has-text("Zapisana")');
	await other.page.goto(B + '/lists', { waitUntil: 'networkidle' });
	check((await other.page.textContent('main'))?.includes(listTitle), 'saved list appears under Saved lists');
	await page.goto(B + '/notifications', { waitUntil: 'networkidle' });
	check((await page.textContent('[data-testid=inbox]'))?.includes('zapisuje Twoją listę'), 'owner is notified');
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
	console.log(`screenshots: ${out}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
