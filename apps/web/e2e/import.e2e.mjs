/**
 * Phase 9 end-to-end: Goodreads CSV upload → preview → import with live progress → report and
 * "which book is it?" review; lubimyczytac-style file keeps 1–10 ratings; exports (CSV + JSON);
 * statistics page; year in review slides + link preview image. Needs the worker (`npm run dev:worker`).
 *
 *   node apps/web/e2e/import.e2e.mjs        Env: BASE_URL, CHROME, OUT
 */
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const B = process.env.BASE_URL ?? 'http://localhost:5173';
const out = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'bok-e2e-'));
const stamp = Date.now().toString(36);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' };
const errors = [];
let failed = false;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || (failed = true));

const H = ['Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors', 'ISBN', 'ISBN13', 'My Rating', 'Average Rating', 'Publisher', 'Binding', 'Number of Pages', 'Year Published', 'Original Publication Year', 'Date Read', 'Date Added', 'Bookshelves', 'Bookshelves with positions', 'Exclusive Shelf', 'My Review', 'Spoiler', 'Private Notes', 'Read Count', 'Owned Copies'];
const row = (o) => H.map((h) => `"${String(o[h] ?? '').replace(/"/g, '""')}"`).join(',');
const goodreads = [
	H.join(','),
	row({ 'Book Id': 1, Title: 'The Hobbit (Middle-earth, #1)', Author: 'J.R.R. Tolkien', ISBN13: '="9780547928227"', 'My Rating': 4, 'Date Read': '2023/05/14', Bookshelves: `ulubione${stamp}`, 'Exclusive Shelf': 'read', 'My Review': 'Świetna!', 'Read Count': 1, 'Owned Copies': 1, 'Number of Pages': 300 }),
	row({ 'Book Id': 2, Title: 'Bóg i geometria', Author: 'Michał Heller', ISBN13: '="9788378865759"', 'Exclusive Shelf': 'to-read' }),
	row({ 'Book Id': 3, Title: 'Hobbit', Author: 'Tolkien', 'Exclusive Shelf': 'read', 'Date Read': '2019/02/02', 'My Rating': 5 }),
	row({ 'Book Id': 4, Title: `Zupełnie nowa książka ${stamp}`, Author: `Autor ${stamp}`, 'Exclusive Shelf': 'read', 'Date Read': '2023/11/03', 'Number of Pages': 210, 'My Rating': 3 })
].join('\n');
const lubimy = `Tytuł;Autor;ISBN;Moja ocena;Półka;Data przeczytania\nOstatnie życzenie;Andrzej Sapkowski;9788375780635;8;Przeczytane;2023-08-01\n`;

async function user(name) {
	const ctx = await browser.newContext({ ...device, acceptDownloads: true });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	await page.goto(B + '/auth/sign-up', { waitUntil: 'networkidle' });
	await page.fill('#name', `${name} ${stamp}`);
	await page.fill('#email', `delivered+${name.toLowerCase()}${stamp}@resend.dev`);
	await page.fill('#password', 'correct-horse-battery');
	await page.check('input[name=terms]');
	await Promise.all([page.waitForURL(B + '/'), page.click('form button.btn-primary')]);
	await page.goto(B + '/settings', { waitUntil: 'networkidle' });
	return { ctx, page, handle: await page.inputValue('#handle') };
}
async function upload(page, name, content) {
	const f = join(out, name);
	writeFileSync(f, content);
	await page.goto(B + '/import', { waitUntil: 'networkidle' });
	await page.setInputFiles('[data-testid=import-file]', f);
	await Promise.all([page.waitForURL(/\/import\/[0-9a-f-]+$/), page.click('[data-testid=import-upload]')]);
	await page.waitForSelector('[data-testid=import-preview]');
}
const json = (page, path) => page.evaluate(async (p) => (await fetch(p)).json(), path);
const text = (page, path) => page.evaluate(async (p) => (await fetch(p)).text(), path);

try {
	const { page: p, handle } = await user('Import');
	await p.click('[data-testid=import-link]');
	await p.waitForURL(B + '/import');

	// ── Goodreads: preview → import → report ──
	await upload(p, 'goodreads_library_export.csv', goodreads);
	const pv = await p.textContent('[data-testid=import-preview]');
	check(pv.includes('Eksport z Goodreads') && pv.includes('4'), 'preview: detected Goodreads, 4 books');
	check(!(await p.isChecked('input[name=ratingScale][value="10"]')), 'rating scale 1–5 detected');
	await p.screenshot({ path: join(out, 'import-preview.png'), fullPage: true });
	const t0 = Date.now();
	await p.click('[data-testid=import-confirm]');
	await p.waitForSelector('[data-testid=import][data-status=done]', { timeout: 60_000 });
	check(true, `import finished in ${Date.now() - t0} ms (worker + live progress)`);
	const matched = Number(await p.textContent('[data-testid=stat-matched]'));
	const created = Number(await p.textContent('[data-testid=stat-created]'));
	const review = Number(await p.textContent('[data-testid=stat-review]'));
	check(matched + created + review === 4, `report: ${matched} found, ${created} added from the file, ${review} to check`);
	// Uncertain rows: the bare "Hobbit" → pick the catalogue's Hobbit; anything else → add from the file.
	for (let left = review; left > 0; left--) {
		const first = p.locator('[data-testid=review-rows] form').first();
		const isHobbit = (await first.textContent()).includes('Hobbit ·') || (await first.textContent()).startsWith('Hobbit');
		if (isHobbit) await first.locator('[data-testid=pick-candidate]').first().click();
		else await first.locator('button[value=create]').click();
		await p.waitForFunction((n) => document.querySelectorAll('[data-testid=review-rows] form').length < n, left);
	}
	if (review) check(!(await p.$('[data-testid=review-rows]')), `uncertain matches resolved (${review})`);
	await p.screenshot({ path: join(out, 'import-report.png'), fullPage: true });

	// ── Imported data ──
	const data = await json(p, '/api/v1/export/data.json');
	const hob = data.reads.find((r) => r.title === 'The Hobbit' && r.finished_on === '2023-05-14');
	check(hob?.rating === 8 && hob?.review === 'Świetna!' && hob?.finished_at === null, 'Hobbit: rating 4★ → 8, review, date; kept out of feeds');
	check(data.readingStates.some((s) => s.title === 'Bóg i geometria' && s.status === 'want_to_read'), 'to-read → want to read');
	check(data.tags.some((t) => t.name === `ulubione${stamp}`), 'custom shelf → tag');
	check(data.copies.length === 1, 'owned copy added to Unsorted');

	// ── lubimyczytac: 1–10 ratings kept ──
	await upload(p, 'lubimyczytac.csv', lubimy);
	check((await p.textContent('[data-testid=import-preview]')).includes('lubimyczytac') && (await p.isChecked('input[name=ratingScale][value="10"]')), 'lubimyczytac file: scale 1–10 preselected');
	await p.click('[data-testid=import-confirm]');
	await p.waitForSelector('[data-testid=import][data-status=done]', { timeout: 60_000 });
	const data2 = await json(p, '/api/v1/export/data.json');
	check(data2.reads.find((r) => r.title === 'Ostatnie życzenie')?.rating === 8, 'lubimyczytac rating 8/10 stays 8');

	// ── Re-import is idempotent ──
	await upload(p, 'again.csv', goodreads);
	await p.click('[data-testid=import-confirm]');
	await p.waitForSelector('[data-testid=import][data-status=done]', { timeout: 60_000 });
	const data3 = await json(p, '/api/v1/export/data.json');
	check(data3.reads.length === data2.reads.length && data3.copies.length === 1, `same file again adds nothing (${data3.reads.length} reads)`);

	// ── Export CSV ──
	const csv = await text(p, '/api/v1/export/goodreads.csv');
	check(csv.includes('"=""9780547928227"""') || csv.includes('="9780547928227"'), 'Goodreads CSV export has the ISBN in Goodreads form');
	check(csv.split('\n')[0].includes('Exclusive Shelf'), 'CSV has Goodreads headers');

	// ── Stats + year in review ──
	await p.goto(`${B}/u/${handle}/stats?year=2023`, { waitUntil: 'networkidle' });
	check(Number(await p.textContent('[data-testid=stat-books]')) === 3, 'stats 2023: 3 books');
	check(Number((await p.textContent('[data-testid=stat-pages]')).replace(/\D/g, '')) >= 510, 'stats 2023: pages counted');
	await p.screenshot({ path: join(out, 'stats.png'), fullPage: true });
	await p.click('[data-testid=year-link]');
	await p.waitForSelector('[data-testid=year][data-slide=intro]');
	await p.mouse.click(350, 400);
	await p.waitForSelector('[data-testid=year][data-slide=count]');
	check((await p.textContent('[data-testid=year-books]')) === '3', 'year in review: 3 books');
	await p.screenshot({ path: join(out, 'year-count.png') });
	for (let i = 0; i < 8; i++) await p.mouse.click(350, 400).catch(() => {});
	await p.waitForSelector('[data-testid=year][data-slide=end]');
	await p.screenshot({ path: join(out, 'year-end.png') });
	const html = await (await fetch(`${B}/u/${handle}/year/2023`, { headers: { 'user-agent': 'facebookexternalhit/1.1' } })).text();
	const img = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
	const r = await fetch(img.replace(/^https?:\/\/[^/]+/, B));
	const buf = Buffer.from(await r.arrayBuffer());
	const info = await sharp(buf).metadata();
	check(r.status === 200 && info.width === 1200 && info.height === 630, 'year in review link preview 1200×630');
	await sharp(buf).toFile(join(out, 'og-year.png'));
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
	console.log(`screenshots: ${out}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
