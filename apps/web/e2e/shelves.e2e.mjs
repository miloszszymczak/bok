/**
 * Phase 3 end-to-end: rooms, the bookcase designer, scanning shelf by shelf with "Next shelf",
 * move scans, duplicates → "move here", inventory, Unsorted, layout changes and sharing.
 * Needs the dev server (npm run dev); the ISBNs below must already be catalogued (run scan.e2e first).
 *
 *   node apps/web/e2e/shelves.e2e.mjs        Env: BASE_URL, CHROME, OUT
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const B = process.env.BASE_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const SAP = '9788375780635', HOB = '9780547928227', HEL = '9788378865759', TAY = '9788382251586', PIL = '9788378865162', PHM = '9780593135204';

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' };
let failed = false;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || (failed = true));
const errors = [];

async function newUser(name) {
	const ctx = await browser.newContext(device);
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	await page.goto(B + '/auth/sign-up', { waitUntil: 'networkidle' });
	await page.fill('#name', name);
	await page.fill('#email', `delivered+${name.toLowerCase()}${Date.now()}@resend.dev`);
	await page.fill('#password', 'correct-horse-battery');
	await page.check('input[name=terms]');
	await Promise.all([page.waitForURL(B + '/'), page.click('form button.btn-primary')]);
	return { ctx, page };
}

/** Scan by typing the code (the camera path is covered by scan.e2e). */
async function type(page, code) {
	if (!(await page.isVisible('input[inputmode=numeric]'))) await page.click('button:has-text("Wpisz"):visible');
	await page.fill('input[inputmode=numeric]', code);
	await page.press('input[inputmode=numeric]', 'Enter');
}
const status = (page, code) => page.waitForSelector(`li[data-code="${code}"]:not([data-status=queued]):not([data-status=sending])`).then((el) => el.getAttribute('data-status'));

async function whereIs(page, code) {
	await page.goto(`${B}/isbn/${code}`, { waitUntil: 'networkidle' });
	return (await page.textContent('[data-testid=where-label]').catch(() => null))?.trim() ?? 'Unsorted';
}

try {
	const { page, ctx } = await newUser('Ola');

	// ── Room + bookcase designer ──
	await page.goto(B + '/library?view=shelves', { waitUntil: 'networkidle' });
	await page.fill('input[name=name]', 'Salon');
	await Promise.all([page.waitForURL(/\/library\/r\//), page.click('form button:has-text("Dodaj pokój")')]);
	await Promise.all([page.waitForURL(/\/library\/c\/new/), page.click('a:has-text("Dodaj regał")')]);
	await page.waitForLoadState('networkidle');
	const t0 = Date.now();
	let taps = 0;
	const tap = async (sel) => (taps++, page.click(sel));
	await page.fill('#name', 'Billy');
	for (let i = 0; i < 3; i++) await tap('button[aria-label="Dodaj kolumnę"]');
	const col = (i) => `[data-column="${i}"]`;
	await tap(`${col(0)} button[aria-label="Usuń półkę"]`);
	await tap(`${col(0)} button[aria-label="Usuń półkę"]`);
	await tap(`${col(3)} button[aria-label="Usuń półkę"]`);
	await tap(`${col(4)} button[aria-label="Dodaj półkę"]`);
	// Drag the divider under shelf B1 down a bit (mixed heights within a column).
	const handle = page.locator('g[role=slider][aria-label="Dół półki B1"]');
	await handle.scrollIntoViewIfNeeded();
	const box = await handle.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 25, { steps: 5 });
	await page.mouse.up();
	taps++;
	const layout = JSON.parse(await page.inputValue('input[name=layout]'));
	check(
		JSON.stringify(layout.columns.map((c) => c.shelves.length)) === '[3,5,5,4,6]' && layout.columns[1].shelves[0] > layout.columns[1].shelves[1],
		`designer: 5 columns ${JSON.stringify(layout.columns.map((c) => c.shelves.length))}, B1 taller than B2 (${layout.columns[1].shelves[0]} vs ${layout.columns[1].shelves[1]})`
	);
	await page.screenshot({ path: join(out, 'designer.png') });
	await Promise.all([page.waitForURL(/\/library\/c\/[0-9a-f-]+$/), tap('button:has-text("Utwórz regał")')]);
	check(Date.now() - t0 < 60_000, `bookcase drawn in ${taps} interactions, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	check((await page.locator('svg g[role=button]').count()) === 23, 'bookcase page shows 23 tappable shelves');
	await page.screenshot({ path: join(out, 'bookcase.png') });
	const bookcaseUrl = page.url();

	// ── Scan three shelves with Next shelf ──
	await Promise.all([page.waitForURL(/\/scan\?target=/), page.click('a:has-text("Skanuj tutaj")')]);
	await page.waitForSelector('[data-testid=target-label]');
	check((await page.textContent('[data-testid=target-label]')) === 'A1', 'scan target starts at A1');
	await type(page, SAP);
	await status(page, SAP);
	await page.click('[data-testid=next-shelf]');
	await type(page, HOB);
	await type(page, HEL);
	await status(page, HOB);
	await status(page, HEL);
	await page.click('[data-testid=next-shelf]');
	check((await page.textContent('[data-testid=target-label]')) === 'A3', 'next shelf → A3');
	await type(page, TAY);
	await status(page, TAY);
	await page.screenshot({ path: join(out, 'scan-target.png') });

	// Duplicate while aiming at A3 → "Move here".
	await type(page, SAP);
	await page.waitForSelector(`li[data-code="${SAP}"][data-status=duplicate]`);
	await page.click(`li[data-code="${SAP}"][data-status=duplicate] button:has-text("Przenieś tutaj")`);
	await page.waitForSelector(`li[data-code="${SAP}"][data-status=moved]`);
	check(true, 'duplicate on another shelf → moved here');

	// Move mode onto A1.
	await page.click('button[role=tab]:has-text("Przenieś")');
	await page.click('[data-testid=scan-target] button');
	await page.click('div[role=dialog] button[data-pick]:text-is("A1")');
	await type(page, HOB);
	await page.waitForSelector(`li[data-code="${HOB}"][data-status=moved]`);
	check(true, 'move mode: Hobbit → A1');
	await page.click('button[role=tab]:has-text("Dodaj")');

	const places = {};
	for (const [code, want] of [[SAP, 'A3'], [HOB, 'A1'], [HEL, 'A2'], [TAY, 'A3']]) places[code] = [await whereIs(page, code), want];
	check(Object.values(places).every(([got, want]) => got === want), `book pages show the right shelf: ${JSON.stringify(places)}`);
	await page.screenshot({ path: join(out, 'where-is-it.png') });

	// ── Inventory of A2: expected Heller + Piłkomatyka; scan Heller (✓), Taylor (on A3 → ⇄), Hail Mary (not owned → +) ──
	await page.goto(B + '/scan', { waitUntil: 'networkidle' });
	await page.click('[data-testid=scan-target] button');
	await page.click('div[role=dialog] button[data-pick]:text-is("A2")');
	await type(page, PIL);
	await status(page, PIL);
	await page.goto(bookcaseUrl, { waitUntil: 'networkidle' });
	await page.click('svg g[role=button][aria-label="A2"]');
	await page.waitForURL(/\/library\/s\//);
	const shelfUrl = page.url();
	await Promise.all([page.waitForURL(/inventory=/), page.click('a:has-text("Inwentaryzacja")')]);
	await page.waitForSelector('[data-testid=inventory]');
	await page.waitForFunction(() => !document.body.textContent?.includes('Ładowanie'));
	for (const code of [HEL, TAY, PHM]) {
		await type(page, code);
		await page.waitForTimeout(400);
	}
	await page.click('[data-testid=inventory-finish]');
	await page.waitForSelector('a:has-text("Wróć do półki")');
	const counts = {};
	for (const k of ['confirmed', 'missing', 'misplaced', 'unknown']) counts[k] = Number(await page.textContent(`[data-testid=inv-${k}]`));
	check(JSON.stringify(counts) === JSON.stringify({ confirmed: 1, missing: 1, misplaced: 1, unknown: 1 }), `inventory report ${JSON.stringify(counts)}`);
	await page.screenshot({ path: join(out, 'inventory.png'), fullPage: true });
	await page.click(`li[data-inv=misplaced][data-code="${TAY}"] button`);
	await page.waitForSelector(`li[data-inv=misplaced][data-code="${TAY}"] >> text=Przeniesiono`);
	await page.click(`li[data-inv=unknown][data-code="${PHM}"] button`);
	await page.waitForSelector(`li[data-inv=unknown][data-code="${PHM}"] >> text=Dodano`);
	await page.goto(shelfUrl, { waitUntil: 'networkidle' });
	check((await page.locator('ul.card li').count()) === 4, 'after fixes A2 holds Heller, Piłkomatyka, Taylor and Hail Mary');
	check((await page.textContent('main'))?.includes('Ostatnia inwentaryzacja'), 'shelf page shows the last inventory');

	// ── Unsorted → multi-select move ──
	await page.goto(B + '/scan', { waitUntil: 'networkidle' });
	await page.click('[data-testid=scan-target] button');
	await page.click('div[role=dialog] button[data-pick=unsorted]');
	await type(page, '9788381810814');
	await status(page, '9788381810814');
	await page.goto(B + '/library?view=shelves', { waitUntil: 'networkidle' });
	await Promise.all([page.waitForURL(/unsorted/), page.click('[data-testid=unsorted]')]);
	await page.click('button:has-text("Zaznacz")');
	await page.click('button:has-text("Wszystkie")');
	await page.click('button:has-text("Przenieś na…")');
	await page.click('div[role=dialog] button[data-pick]:text-is("E6")');
	await page.waitForSelector('text=Przeniesiono: 1');
	check(true, 'unsorted book moved to E6');

	// ── Layout change that removes a non-empty shelf ──
	await page.goto(bookcaseUrl + '/edit', { waitUntil: 'networkidle' });
	await page.click(`[data-column="4"] button[aria-label="Usuń półkę"]`);
	await page.click('main > button.btn-primary');
	await page.waitForSelector('[role=alert]:has-text("E6")');
	await Promise.all([page.waitForURL(bookcaseUrl), page.click('button:has-text("Przenieś do nieprzypisanych")')]);
	check((await page.locator('svg g[role=button]').count()) === 22, 'shelf removed; its book went to Unsorted');

	// ── Sharing ──
	await page.goto(B + '/settings', { waitUntil: 'networkidle' });
	await page.click('button:has-text("Zaproś kogoś")');
	const inviteUrl = await page.inputValue('[data-testid=invite-url]');
	const bob = await newUser('Bartek');
	await bob.page.goto(inviteUrl, { waitUntil: 'networkidle' });
	await Promise.all([bob.page.waitForURL(/view=shelves/), bob.page.click('form button:has-text("Dołącz")')]);
	check((await bob.page.textContent('main'))?.includes('Billy'), 'invited user sees the shared bookcase');
	await bob.ctx.close();
	await ctx.close();
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
	console.log(`screenshots: ${out}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
