/**
 * Phase 4 end-to-end: statuses, progress, the finish sheet (rating, dates, estimate),
 * the diary (months, "Past"), editing a read (override), goal, card status chip,
 * bookstore mode (read before / want-to-read, also offline), tags and series.
 * The 30-day "stuck" rule is covered by packages/server/test/reading.test.ts (simulated clock).
 *
 *   node apps/web/e2e/reading.e2e.mjs        Env: BASE_URL, CHROME, OUT
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const B = process.env.BASE_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const SAP = '9788375780635', HOB = '9780547928227', HEL = '9788378865759', TAY = '9788382251586';

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = false;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || (failed = true));
const openBook = async (code) => {
	await page.goto(`${B}/isbn/${code}`, { waitUntil: 'networkidle' });
	await page.waitForSelector('[data-testid=reading-panel]');
};
const panelStatus = () => page.getAttribute('[data-testid=reading-panel]', 'data-status');
const today = new Date().toISOString().slice(0, 10);

try {
	await page.goto(B + '/auth/sign-up', { waitUntil: 'networkidle' });
	await page.fill('#name', 'Czytelnik');
	await page.fill('#email', `delivered+read${Date.now()}@resend.dev`);
	await page.fill('#password', 'correct-horse-battery');
	await page.check('input[name=terms]');
	await Promise.all([page.waitForURL(B + '/'), page.click('form button.btn-primary')]);

	// ── Status + progress ──
	await openBook(HOB);
	await page.click('[data-set-status=reading]');
	await page.waitForFunction(() => document.querySelector('[data-testid=reading-panel]')?.getAttribute('data-status') === 'reading');
	await page.fill('input[name=progress]', '120');
	await Promise.all([page.waitForResponse((r) => r.url().includes('/progress') && r.request().method() === 'POST'), page.click('[data-testid=progress-save]')]);
	await page.click('button:has-text("Oś czasu")');
	await page.waitForSelector('[data-testid=timeline] >> text=str. 120', { timeout: 5000 }).catch(() => {});
	const timeline = await page.textContent('[data-testid=timeline]');
	check(timeline.includes('Rozpoczęto') && timeline.includes('str. 120'), `reading + progress recorded on the timeline: ${timeline.replace(/\s+/g, ' ')}`);
	await page.goto(B + '/', { waitUntil: 'networkidle' });
	check((await page.textContent('[data-testid=currently-reading]'))?.includes('The Hobbit'), 'home shows currently reading');

	// ── Finish with rating, review, spoiler ──
	await openBook(HOB);
	await page.click('[data-set-status=read]');
	await page.waitForSelector('div[role=dialog]');
	await page.click('button[aria-label="4.5 gw."]');
	check((await page.textContent('[data-testid=rating-value]')) === '9/10', 'half-star rating = 9/10');
	await page.fill('#review', 'Świetna przygoda.');
	await page.check('input[name=reviewSpoiler]');
	check((await page.textContent('[data-testid=estimate]')).includes('1'), `estimate shown: ${await page.textContent('[data-testid=estimate]')}`);
	await page.screenshot({ path: join(out, 'finish-sheet.png') });
	await page.click('[data-testid=finish-save]');
	await page.waitForFunction(() => document.querySelector('[data-testid=reading-panel]')?.getAttribute('data-status') === 'read');
	check(true, 'finished → status read');

	// ── Other books: no date (Past), month only ──
	await openBook(SAP);
	await page.click('[data-set-status=read]');
	await page.click('[data-precision=none]');
	await page.click('[data-testid=finish-save]');
	await page.waitForFunction(() => document.querySelector('[data-testid=reading-panel]')?.getAttribute('data-status') === 'read');
	await openBook(HEL);
	await page.click('[data-set-status=read]');
	await page.click('[data-precision=month]');
	await page.fill('input[type=month]', '2026-02');
	await page.click('[data-testid=finish-save]');
	await page.waitForFunction(() => document.querySelector('[data-testid=reading-panel]')?.getAttribute('data-status') === 'read');

	await page.goto(B + '/log', { waitUntil: 'networkidle' });
	const log = await page.$$eval('section[data-log-year]', (secs) =>
		secs.map((s) => [s.dataset.logYear, [...s.querySelectorAll('[data-entry]')].map((e) => e.dataset.entry)])
	);
	check(
		JSON.stringify(log.at(-1)) === JSON.stringify(['past', ['Ostatnie życzenie']]) && log.some(([y, t]) => y === '2026' && t.includes('Bóg i geometria')),
		`log groups: ${JSON.stringify(log)}`
	);
	const feb = await page.$eval('section[data-log-year="2026"]', (s) => [...s.querySelectorAll('h3[data-log-month]')].map((h) => h.dataset.logMonth));
	check(feb.includes('2'), `Heller filed under February (${feb})`);
	await page.screenshot({ path: join(out, 'log.png'), fullPage: true });

	// ── Edit a read: override duration ──
	await page.click('[data-entry="The Hobbit"]');
	await page.waitForURL(/\/read\//);
	await page.click('[data-testid=edit-read]');
	await page.fill('#duration', '20');
	await page.click('[data-testid=finish-save]');
	await page.waitForSelector('text=Zapisano');
	check((await page.textContent('[data-testid=read-days]')) === '20 dni', 'override replaces the estimate on the read page');
	await openBook(HOB);
	check((await page.textContent('[data-testid=duration]')) === '20 dni', 'override replaces the estimate on the book page');

	// ── Goal ──
	await page.goto(B + '/log', { waitUntil: 'networkidle' });
	await page.fill('#target', '24');
	await page.click('[data-testid=goal] button:has-text("Zapisz")');
	await page.waitForSelector('[data-testid=goal-status]');
	check(Number(await page.textContent('[data-testid=goal-done]')) === 2, `goal counts this year's reads; status: ${await page.textContent('[data-testid=goal-status]')}`);

	// ── Card status chip ──
	await openBook(TAY);
	await page.click('button:has-text("Dodaj do biblioteki")');
	await page.waitForSelector('text=Dodano do biblioteki');
	await page.goto(B + '/library', { waitUntil: 'networkidle' });
	await page.click('[data-status-chip=none]');
	await page.click('div[role=menu] button:has-text("Chcę przeczytać")');
	await page.waitForSelector('[data-status-chip=want_to_read]');
	await page.reload({ waitUntil: 'networkidle' });
	check(!!(await page.$('[data-status-chip=want_to_read]')), 'status chip persists');
	await page.goto(B + '/library?status=want_to_read', { waitUntil: 'networkidle' });
	check((await page.locator('[data-status-chip]').count()) === 1, 'library filter by status');

	// ── Tags + series ──
	await openBook(HOB);
	await page.fill('[data-testid=tags] input[name=tag]:not([type=hidden])', 'fantastyka');
	await page.press('[data-testid=tags] input[name=tag]:not([type=hidden])', 'Enter');
	await page.waitForSelector('[data-testid=tags] button:has-text("#fantastyka ×")');
	await page.goto(B + '/log?tag=fantastyka', { waitUntil: 'networkidle' });
	check(JSON.stringify(await page.$$eval('[data-entry]', (e) => e.map((x) => x.dataset.entry))) === '["The Hobbit"]', 'log filtered by tag');
	await openBook(SAP);
	const seriesLink = await page.textContent('[data-testid=series-link]').catch(() => null);
	check(seriesLink?.includes('Wiedźmin'), `series link on the book page (${seriesLink})`);

	// ── Bookstore mode ──
	await page.goto(B + '/scan', { waitUntil: 'networkidle' });
	await page.click('button[role=tab]:has-text("Sprawdź")');
	await page.click('button:has-text("Wpisz"):visible');
	for (const [code, want] of [[HOB, 'Czytane już (1×)'], [TAY, 'Na Twojej liście']]) {
		await page.fill('input[inputmode=numeric]', code);
		await page.press('input[inputmode=numeric]', 'Enter');
		await page.waitForSelector(`[data-testid=verdict-reading]:has-text("${want}")`, { timeout: 10_000 });
		check(true, `bookstore online ${code}: ${want}`);
	}
	await ctx.setOffline(true);
	await page.fill('input[inputmode=numeric]', HOB);
	await page.press('input[inputmode=numeric]', 'Enter');
	await page.waitForSelector('[data-testid=verdict-reading]:has-text("Czytane już")', { timeout: 5000 });
	check(true, 'bookstore offline still knows "read before" (book not owned)');
	await page.screenshot({ path: join(out, 'bookstore-read-before.png') });
	await ctx.setOffline(false);
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
	console.log(`screenshots: ${out}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
