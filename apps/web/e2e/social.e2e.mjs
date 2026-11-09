/**
 * Phase 5 end-to-end: friend request with a live in-app badge (SSE, no reload), accept,
 * follow, library/log visibility for friend vs stranger, people search, block, report →
 * admin suspension (needs DATABASE_URL to make the admin).
 * Push delivery itself is covered by packages/server/test/social.test.ts (fake push service).
 *
 *   DATABASE_URL=… node apps/web/e2e/social.e2e.mjs        Env: BASE_URL, CHROME, OUT
 */
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const B = process.env.BASE_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const stamp = Date.now().toString(36);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' };
const errors = [];
let failed = false;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || (failed = true));

async function user(name) {
	const ctx = await browser.newContext(device);
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	const email = `delivered+${name.toLowerCase()}${stamp}@resend.dev`;
	await page.goto(B + '/auth/sign-up', { waitUntil: 'networkidle' });
	await page.fill('#name', `${name} ${stamp}`);
	await page.fill('#email', email);
	await page.fill('#password', 'correct-horse-battery');
	await page.check('input[name=terms]');
	await Promise.all([page.waitForURL(B + '/'), page.click('form button.btn-primary')]);
	await page.goto(B + '/settings', { waitUntil: 'networkidle' });
	const handle = await page.inputValue('#handle');
	return { ctx, page, handle, email };
}

try {
	const ola = await user('Ola');
	const bartek = await user('Bartek');
	const celina = await user('Celina');

	// ── Friend request → live badge on Bartek's home without reload ──
	await bartek.page.goto(B + '/', { waitUntil: 'networkidle' });
	await bartek.page.waitForTimeout(500); // EventSource connected
	await ola.page.goto(`${B}/u/${bartek.handle}`, { waitUntil: 'networkidle' });
	const t0 = Date.now();
	await ola.page.click('[data-testid=friend]');
	await bartek.page.waitForSelector('[data-testid=unread-badge]', { timeout: 5000 });
	check(Date.now() - t0 < 5000, `friend request shows up live for the recipient in ${Date.now() - t0}ms`);
	await bartek.page.screenshot({ path: join(out, 'live-badge.png') });

	await bartek.page.goto(B + '/notifications', { waitUntil: 'networkidle' });
	check((await bartek.page.textContent('[data-testid=inbox]'))?.includes('zaprasza Cię do znajomych'), 'inbox lists the request');
	await bartek.page.goto(B + '/people/requests', { waitUntil: 'networkidle' });
	await bartek.page.click(`[data-testid="accept-${ola.handle}"]`);
	await bartek.page.waitForSelector('text=Brak oczekujących zaproszeń');
	await ola.page.goto(`${B}/u/${bartek.handle}`, { waitUntil: 'networkidle' });
	check((await ola.page.textContent('[data-testid=friend]'))?.includes('Znajomi'), 'requester sees "Friends" after acceptance');
	check((await ola.page.textContent('[data-testid=follow]'))?.trim() === 'Obserwuj', 'friendship does not imply following');
	await ola.page.click('[data-testid=follow]');
	await ola.page.waitForSelector('[data-testid=follow]:has-text("Obserwujesz")');
	check((await ola.page.textContent('[data-testid=followers-count]')) === '1', 'follower count updates');

	// ── Visibility: Bartek's library is friends-only; a friends-only read ──
	await bartek.page.goto(B + '/settings', { waitUntil: 'networkidle' });
	await bartek.page.selectOption('#libraryVisibility', 'friends');
	await bartek.page.click('#privacy button:has-text("Zapisz")');
	await bartek.page.waitForSelector('#privacy >> text=Zapisano');
	await bartek.page.goto(`${B}/isbn/9780547928227`, { waitUntil: 'networkidle' });
	await bartek.page.click('button:has-text("Dodaj do biblioteki")');
	await bartek.page.waitForSelector('text=Dodano do biblioteki');
	await bartek.page.click('[data-set-status=read]');
	await bartek.page.selectOption('#visibility', 'friends');
	await bartek.page.click('[data-testid=finish-save]');
	await bartek.page.waitForFunction(() => document.querySelector('[data-testid=reading-panel]')?.getAttribute('data-status') === 'read');

	await ola.page.goto(`${B}/u/${bartek.handle}?tab=library`, { waitUntil: 'networkidle' });
	check(!!(await ola.page.$('[data-testid=public-library]')), 'friend sees the friends-only library');
	await celina.page.goto(`${B}/u/${bartek.handle}?tab=library`, { waitUntil: 'networkidle' });
	check(!!(await celina.page.$('[data-testid=library-hidden]')), 'stranger sees "library is private"');
	await ola.page.goto(`${B}/u/${bartek.handle}`, { waitUntil: 'networkidle' });
	check(!!(await ola.page.$('[data-entry="The Hobbit"]')), 'friend sees the friends-only log entry');
	await celina.page.goto(`${B}/u/${bartek.handle}`, { waitUntil: 'networkidle' });
	check(!(await celina.page.$('[data-entry="The Hobbit"]')), 'stranger does not');
	const anon = await (await browser.newContext(device)).newPage();
	await anon.goto(`${B}/u/${bartek.handle}`, { waitUntil: 'networkidle' });
	check(!(await anon.$('[data-entry="The Hobbit"]')) && !!(await anon.$('a:has-text("Zaloguj się, aby obserwować")')), 'signed-out visitor sees the public profile only');

	// ── People search ──
	await celina.page.goto(`${B}/people?q=bartek ${stamp}`, { waitUntil: 'networkidle' });
	check(!!(await celina.page.$(`[data-testid=people-results] [data-person="${bartek.handle}"]`)), 'people search finds by name');

	// ── Block ──
	await bartek.page.goto(`${B}/u/${celina.handle}`, { waitUntil: 'networkidle' });
	await bartek.page.click('[data-testid=profile-menu]');
	await bartek.page.click('div[role=menu] button:has-text("Zablokuj")');
	await bartek.page.click('[data-testid=confirm-block]');
	await bartek.page.waitForSelector('text=To konto jest przez Ciebie zablokowane');
	const res = await celina.page.goto(`${B}/u/${bartek.handle}`);
	check(res?.status() === 404, `blocked user gets 404 on the blocker's profile (${res?.status()})`);
	await celina.page.goto(`${B}/people?q=bartek ${stamp}`, { waitUntil: 'networkidle' });
	check(!(await celina.page.$(`[data-person="${bartek.handle}"]`)), 'and cannot find them in search');

	// ── Report → suspend ──
	await celina.page.goto(`${B}/u/${ola.handle}`, { waitUntil: 'networkidle' });
	await celina.page.click('[data-testid=profile-menu]');
	await celina.page.click('div[role=menu] button:has-text("Zgłoś")');
	await celina.page.click('[data-testid=send-report]');
	await celina.page.waitForSelector('text=Dziękujemy');
	check(true, 'report sent');
	if (process.env.DATABASE_URL) {
		const sql = require('postgres')(process.env.DATABASE_URL, { max: 1 });
		await sql`update profiles set role = 'admin' where handle = ${celina.handle}`;
		await sql.end();
		await celina.page.goto(B + '/admin/reports', { waitUntil: 'networkidle' });
		await celina.page.click(`article:has-text("@${ola.handle}") [data-testid=suspend]`);
		await celina.page.waitForSelector(`text=Brak otwartych zgłoszeń`);
		const r2 = await bartek.page.goto(`${B}/u/${ola.handle}`);
		check(r2?.status() === 404, 'suspended profile is hidden');
		await ola.page.goto(B + '/library');
		check(ola.page.url().includes('/auth/sign-in'), 'suspended user is signed out');
		await ola.page.fill('#email', ola.email);
		await ola.page.fill('#password', 'correct-horse-battery');
		await ola.page.click('form button.btn-primary');
		await ola.page.waitForSelector('text=To konto jest zawieszone');
		check(true, 'suspended user cannot sign in again');
	} else console.log('(set DATABASE_URL to also test suspension)');
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
	console.log(`screenshots: ${out}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
