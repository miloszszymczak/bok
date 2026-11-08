/**
 * Manual add with a cover photo, then metadata edit. Needs the dev server.
 *   node apps/web/e2e/manual.e2e.mjs
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const B = process.env.BASE_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const photo = join(out, 'cover.jpg');
writeFileSync(photo, await sharp({ create: { width: 900, height: 1350, channels: 3, background: '#7a3b2e' } }).jpeg().toBuffer());

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'pl-PL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = false;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || (failed = true));

try {
	await page.goto(B + '/auth/sign-up', { waitUntil: 'networkidle' });
	const email = `delivered+manual${Date.now()}@resend.dev`;
	await page.fill('#name', 'Manual Test');
	await page.fill('#email', email);
	await page.fill('#password', 'correct-horse-battery');
	await page.check('input[name=terms]');
	await Promise.all([page.waitForURL(B + '/'), page.click('form button.btn-primary')]);

	const title = `Pamiętnik ${Date.now()}`;
	await page.goto(B + `/add?title=${encodeURIComponent(title)}`, { waitUntil: 'networkidle' });
	await page.fill('#authors', 'Zofia Nowak, Jan Nowak');
	await page.fill('#year', '1952');
	await page.setInputFiles('input[name=photo]', photo);
	await Promise.all([page.waitForURL(/\/book\//), page.click('form button.btn-primary')]);
	check((await page.textContent('main h1'))?.includes(title), 'manual book created');
	check(!!(await page.$('img[src*="/media/covers/"]')), 'cover photo stored and shown');
	check((await page.textContent('main'))?.includes('W Twojej bibliotece (1)'), 'added to library');
	await page.screenshot({ path: join(out, 'manual-book.png') });

	await page.click('a:has-text("Edytuj")');
	await page.waitForURL(/\/edit/);
	check((await page.textContent('main'))?.includes('Potwierdź adres e-mail'), 'editing requires a verified email');
	if (process.env.DATABASE_URL) {
		// Mark the account verified directly in the DB, then edit and save.
		const sql = require('postgres')(process.env.DATABASE_URL, { max: 1 });
		await sql`update "user" set email_verified = true where email = ${email}`;
		await sql.end();
		await page.reload({ waitUntil: 'networkidle' });
		await page.fill('#workTitle', `${title} (wyd. II)`);
		await page.fill('#pageCount', '212');
		await Promise.all([page.waitForURL(/saved=1/), page.click('form button.btn-primary')]);
		const main = (await page.textContent('main')) ?? '';
		check(main.includes('Dzięki — zmiany zapisane') && main.includes('212'), 'edits saved and shown');
	} else {
		console.log('(set DATABASE_URL to also test saving edits)');
	}
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
