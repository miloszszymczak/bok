/**
 * Phase 8 end-to-end: lend a copy to a friend (picked from suggestions), the borrower's view,
 * extension request → approve, "I've given it back" → lender confirms, lending history,
 * lendable copies → borrow request → approve, shelf list + bookstore verdict show the loan,
 * a book borrowed from outside the app. Reminder timing is covered by packages/server/test/loans.test.ts.
 *
 *   node apps/web/e2e/loans.e2e.mjs        Env: BASE_URL, CHROME, OUT
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const B = process.env.BASE_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const stamp = Date.now().toString(36);
const HOB = '9780547928227', HEL = '9788378865759';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' };
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
	await page.goto(B + '/settings', { waitUntil: 'networkidle' });
	return { ctx, page, handle: await page.inputValue('#handle'), name: `${name} ${stamp}` };
}
const inbox = async (page) => (await page.goto(B + '/notifications', { waitUntil: 'networkidle' }), await page.textContent('[data-testid=inbox]'));
const api = (page, path) => page.evaluate(async (path) => (await fetch(path)).json(), path);

try {
	const lender = await user('Pozycza');
	const friend = await user('Bierze');
	await friend.page.goto(`${B}/u/${lender.handle}`, { waitUntil: 'networkidle' });
	await friend.page.click('[data-testid=friend]');
	await friend.page.waitForSelector('[data-testid=friend]:has-text("Zaproszenie wysłane")');
	await lender.page.goto(`${B}/people/requests`, { waitUntil: 'networkidle' });
	await lender.page.click(`[data-testid="accept-${friend.handle}"]`);
	await lender.page.waitForSelector('text=Brak oczekujących zaproszeń');

	// ── Lend to a friend ──
	const p = lender.page;
	await p.goto(`${B}/isbn/${HOB}`, { waitUntil: 'networkidle' });
	await p.click('button:has-text("Dodaj do biblioteki")');
	await p.waitForSelector('[data-testid=lend]');
	const bookUrl = p.url();
	await p.click('[data-testid=lend]');
	await p.waitForSelector(`[data-testid=lend-people] [data-person="${friend.handle}"]`);
	check(true, 'friends are suggested first when lending');
	await p.click(`[data-person="${friend.handle}"]`);
	await p.screenshot({ path: join(out, 'lend-sheet.png') });
	await p.click('[data-testid=lend-submit]');
	await p.waitForSelector('[data-testid=copy-lent]');
	const lentText = await p.textContent('[data-testid=copy-lent]');
	check(lentText.includes(friend.name) && /do \d+/.test(lentText), `copy shows "${lentText.trim()}"`);
	check((await inbox(friend.page)).includes('pożycza Ci „The Hobbit”'), 'borrower is notified');

	// ── Borrower's view: extension request → lender agrees ──
	const f = friend.page;
	await f.goto(B + '/loans', { waitUntil: 'networkidle' });
	const due1 = await f.textContent('[data-testid=loans-borrowed] [data-testid=due-text]');
	check(due1.includes('Termin za 14 dni'), `borrowed: ${due1.trim()}`);
	await f.click('[data-testid=loans-borrowed] [data-testid=loan-extend]');
	await f.click('[data-testid=extend-send]'); // default: two more weeks
	await f.waitForSelector('text=Prosisz o przedłużenie');
	check((await inbox(p)).includes('prosi o przedłużenie'), 'lender is asked about the extension');
	await p.goto(B + '/loans', { waitUntil: 'networkidle' });
	await p.click('[data-testid=extension-approve]');
	await p.waitForSelector('[data-testid=extension-request]', { state: 'detached' });
	await f.goto(B + '/loans', { waitUntil: 'networkidle' });
	const due2 = await f.textContent('[data-testid=loans-borrowed] [data-testid=due-text]');
	check(due2.includes('Termin za 28 dni'), `extension approved: ${due2.trim()}`);
	await f.screenshot({ path: join(out, 'loans-borrower.png'), fullPage: true });

	// ── Shelf list + bookstore verdict ──
	await p.goto(B + '/library/unsorted', { waitUntil: 'networkidle' });
	check((await p.textContent('[data-testid=lent-label]'))?.includes(friend.name), 'shelf list shows who has the copy');
	const v = await api(p, `/api/v1/check?code=${HOB}`);
	check(v.copies?.[0]?.lentTo === friend.name && !!v.copies[0].dueOn, 'bookstore check: lent to + due date');
	const vb = await api(f, `/api/v1/check?code=${HOB}`);
	check(vb.borrowed?.[0]?.from === lender.name, 'bookstore check for the borrower: borrowed from');

	// ── Returned: borrower says so, lender confirms ──
	await f.click('[data-testid=loans-borrowed] [data-testid=loan-returned]');
	await f.waitForSelector('text=Czekasz na potwierdzenie zwrotu');
	check((await inbox(p)).includes('zgłasza zwrot'), 'lender asked to confirm the return');
	await p.goto(B + '/loans', { waitUntil: 'networkidle' });
	await p.click('[data-testid=loan-confirm-return]');
	await p.waitForSelector('[data-testid=loans-history] [data-loan]');
	await p.goto(bookUrl, { waitUntil: 'networkidle' });
	check(!(await p.$('[data-testid=copy-lent]')) && !!(await p.$('[data-testid=lend]')), 'copy is back on the shelf');
	check((await p.textContent('[data-testid=copy-history]'))?.includes(friend.name), 'lending history per copy');

	// ── Lendable copy → borrow request → approve (1 month) ──
	await p.check('[data-testid=lendable]');
	await p.waitForTimeout(300);
	await f.goto(`${B}/u/${lender.handle}?tab=lending`, { waitUntil: 'networkidle' });
	check(!!(await f.$('[data-testid=lendable-list] [data-lendable-copy]')), 'friend sees lendable copies on the profile');
	await f.goto(bookUrl, { waitUntil: 'networkidle' });
	await f.click('[data-testid=borrow-from] [data-testid=ask-borrow]');
	await f.waitForSelector('[data-testid=borrow-from] [data-testid=asked]');
	check((await inbox(p)).includes('prosi o pożyczenie „The Hobbit”'), 'lender notified of the request');
	await p.goto(B + '/loans', { waitUntil: 'networkidle' });
	await p.click('[data-testid=loans-requests] [data-testid=loan-approve]');
	await p.click('label:has([data-due="1m"])');
	await p.click('[data-testid=loan-approve-confirm]');
	await p.waitForSelector('[data-testid=loans-lent] [data-loan]');
	check((await inbox(f)).includes('pożyczy Ci „The Hobbit”'), 'borrower told the request was accepted');
	await f.goto(B + '/loans', { waitUntil: 'networkidle' });
	const due3 = await f.textContent('[data-testid=loans-borrowed] [data-testid=due-text]');
	check(/Termin za (28|29|30|31) dni/.test(due3), `approved for a month: ${due3.trim()}`);
	await f.goto(`${B}/loans?with=${lender.handle}`, { waitUntil: 'networkidle' });
	check(!!(await f.$('[data-testid=loans-history] [data-loan]')) && !!(await f.$('[data-testid=loans-borrowed] [data-loan]')), 'lending history per person');

	// ── Borrowed from outside the app ──
	await f.goto(`${B}/isbn/${HEL}`, { waitUntil: 'networkidle' }); // make sure it's catalogued
	await f.goto(B + '/loans', { waitUntil: 'networkidle' });
	await f.click('[data-testid=add-borrowed]');
	await f.fill('[data-testid=borrowed-search]', 'Bóg i geom');
	await f.click('[data-result="Bóg i geometria"]');
	await f.fill('#borrowed-from', 'Biblioteka miejska');
	await f.click('label:has([data-due="2w"])');
	await f.click('[data-testid=borrowed-submit]');
	await f.waitForSelector('[data-testid=loans-borrowed] [data-loan]:has-text("Biblioteka miejska")');
	check(true, 'book borrowed from outside the app is recorded');
	await f.click('[data-testid=loans-borrowed] [data-loan]:has-text("Biblioteka miejska") [data-testid=loan-returned]');
	await f.waitForSelector('[data-testid=loans-history] [data-loan]:has-text("Biblioteka miejska")');
	check(true, 'returning it to a lender outside the app closes it at once');
	await f.screenshot({ path: join(out, 'loans-final.png'), fullPage: true });
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
	console.log(`screenshots: ${out}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
