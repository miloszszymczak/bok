/**
 * Phase 7 end-to-end: compose with $book / @mention / #tag autocomplete, ||spoilers||,
 * friends-only visibility (friend who doesn't follow vs follower who isn't a friend),
 * editing keeps book chips, comments + likes + notifications, feed pagination, tag page,
 * "mentioned in" on the book page, link previews without spoilers, reporting → hide.
 *
 *   DATABASE_URL=… node apps/web/e2e/posts.e2e.mjs        Env: BASE_URL, CHROME, OUT
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
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' };
const errors = [];
let failed = false;
const check = (ok, label) => (console.log(`${ok ? '✓' : '✗'} ${label}`), ok || (failed = true));
const meta = (html, prop) => new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html)?.[1]?.replace(/&amp;/g, '&');

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
	return { ctx, page, handle: await page.inputValue('#handle') };
}
const api = (page, path, method, body) =>
	page.evaluate(async ([path, method, body]) => {
		const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
		return { status: r.status, json: await r.json().catch(() => null) };
	}, [path, method, body]);

try {
	const author = await user('Autor');
	const friend = await user('Przyjaciel');
	const follower = await user('Fan');
	// friend (no follow) and follower (no friendship)
	await friend.page.goto(`${B}/u/${author.handle}`, { waitUntil: 'networkidle' });
	await friend.page.click('[data-testid=friend]');
	await friend.page.waitForSelector('[data-testid=friend]:has-text("Zaproszenie wysłane")');
	await author.page.goto(`${B}/people/requests`, { waitUntil: 'networkidle' });
	await author.page.click(`[data-testid="accept-${friend.handle}"]`);
	await follower.page.goto(`${B}/u/${author.handle}`, { waitUntil: 'networkidle' });
	await follower.page.click('[data-testid=follow]');
	await follower.page.waitForSelector('[data-testid=follow]:has-text("Obserwujesz")');

	// ── Compose with autocomplete ──
	const p = author.page;
	await p.goto(B + '/', { waitUntil: 'networkidle' });
	const box = p.locator('[data-testid=composer-input]').first();
	await box.click();
	await box.pressSequentially('Czytam $hobb', { delay: 30 });
	await p.waitForSelector('[data-testid=suggestions] button:has-text("The Hobbit")');
	await p.click('[data-testid=suggestions] button:has-text("The Hobbit")');
	await box.pressSequentially(`razem z @${friend.handle.slice(0, 6)}`, { delay: 30 });
	await p.waitForSelector(`[data-testid=suggestions] button:has-text("@${friend.handle}")`);
	await p.click(`[data-testid=suggestions] button:has-text("@${friend.handle}")`);
	await box.pressSequentially('#fantastyka zakończenie: ||Smaug ginie||', { delay: 10 });
	check((await box.inputValue()).startsWith('Czytam $[The Hobbit] razem z @'), `editor shows readable tokens: ${await box.inputValue()}`);
	await p.selectOption('[data-testid=composer] select', 'friends');
	await p.click('[data-testid=composer-submit]');
	await p.waitForSelector('article[data-post] [data-book-chip]');
	const postId = await p.getAttribute('article[data-post]', 'data-post');
	await p.screenshot({ path: join(out, 'feed-author.png') });

	// ── Visibility ──
	await friend.page.goto(B + '/', { waitUntil: 'networkidle' });
	check(!!(await friend.page.$(`article[data-post="${postId}"]`)), 'friend (not following) sees the friends-only post in the feed');
	check(!!(await friend.page.$(`article[data-post="${postId}"] [data-spoiler].text-transparent`)), 'inline spoiler is blurred in the feed');
	check(!(await friend.page.textContent(`article[data-post="${postId}"]`)).includes('Smaug ginie') || !!(await friend.page.$(`article[data-post="${postId}"] [data-spoiler].text-transparent`)), 'spoiler text hidden until tapped');
	await friend.page.click(`article[data-post="${postId}"] [data-spoiler]`);
	check(!(await friend.page.$(`article[data-post="${postId}"] [data-spoiler].text-transparent`)), 'tapping reveals the spoiler');
	await follower.page.goto(B + '/', { waitUntil: 'networkidle' });
	check(!(await follower.page.$(`article[data-post="${postId}"]`)), 'follower who is not a friend does not see it');
	check((await follower.page.goto(`${B}/p/${postId}`))?.status() === 404, 'and gets 404 on the post page');
	await friend.page.goto(B + '/notifications', { waitUntil: 'networkidle' });
	check((await friend.page.textContent('[data-testid=inbox]'))?.includes('wspomina o Tobie'), 'mentioned friend is notified');
	await friend.page.goto(`${B}/p/${postId}`, { waitUntil: 'networkidle' });
	await friend.page.click('[data-book-chip]');
	await friend.page.waitForURL(/\/book\//);
	check((await friend.page.textContent('main h1'))?.includes('Hobbit'), 'book chip opens the book');
	check(!!(await friend.page.$(`[data-testid=mentioned-in] article[data-post="${postId}"]`)), 'book page lists the post under "Mentioned in"');

	// ── Edit keeps chips ──
	await p.goto(`${B}/p/${postId}`, { waitUntil: 'networkidle' });
	await p.click('[data-testid=post-menu]');
	await p.click('div[role=menu] button:has-text("Edytuj")');
	const edit = p.locator('[data-testid=composer-input]').first();
	check((await edit.inputValue()).includes('$[The Hobbit]'), 'edit box shows the book token');
	await edit.fill((await edit.inputValue()) + ' — polecam!');
	await p.click('[data-testid=composer-submit]');
	await p.waitForSelector('text=edytowano');
	check(!!(await p.$('[data-book-chip]')) && (await p.textContent(`article[data-post="${postId}"]`)).includes('polecam'), 'book chip survives the edit');

	// ── Comments & likes ──
	await friend.page.goto(`${B}/p/${postId}`, { waitUntil: 'networkidle' });
	await friend.page.click('[data-testid=like]');
	await friend.page.waitForSelector('[data-testid=like-count]:has-text("1")');
	const cbox = friend.page.locator('[data-testid=composer-input]');
	await cbox.fill('Też uwielbiam!');
	await friend.page.click('[data-testid=composer-submit]');
	await friend.page.waitForSelector('[data-testid=comments] li[data-comment]');
	await p.goto(B + '/notifications', { waitUntil: 'networkidle' });
	const inbox = await p.textContent('[data-testid=inbox]');
	check(inbox.includes('komentuje Twój wpis') && inbox.includes('lubi Twój wpis'), 'author notified of comment and like');

	// ── Public posts: tag page, previews without spoilers ──
	const pub = await api(p, '/api/v1/posts', 'POST', { body: 'Publiczny #fantastyka: na końcu ||SEKRET123|| — ale ciii', visibility: 'public' });
	const whole = await api(p, '/api/v1/posts', 'POST', { body: 'Cały wpis to SPOJLER456', visibility: 'public', spoiler: true });
	const anon = await (await browser.newContext(device)).newPage();
	await anon.goto(`${B}/t/fantastyka`, { waitUntil: 'networkidle' });
	const tagText = await anon.textContent('[data-testid=tag-posts]');
	check(!!(await anon.$(`article[data-post="${pub.json.id}"]`)) && !(await anon.$(`article[data-post="${postId}"]`)), 'tag page: public post yes, friends-only no');
	check(!tagText.includes('SEKRET123') || !!(await anon.$('[data-spoiler].text-transparent')), 'spoiler blurred on the tag page');
	for (const [id, secret] of [[pub.json.id, 'SEKRET123'], [whole.json.id, 'SPOJLER456']]) {
		const html = await (await fetch(`${B}/p/${id}`, { headers: { 'user-agent': 'facebookexternalhit/1.1' } })).text();
		const desc = meta(html, 'og:description') ?? '';
		const img = meta(html, 'og:image');
		const r = await fetch(img.replace(/^https?:\/\/[^/]+/, B));
		const buf = Buffer.from(await r.arrayBuffer());
		const info = await sharp(buf).metadata();
		check(!html.includes(secret) || !desc.includes(secret), `preview description hides the spoiler: "${desc}"`);
		check(info.width === 1200 && info.height === 630, 'post preview image 1200×630');
		await sharp(buf).toFile(join(out, `og-post-${id.slice(-4)}.png`));
	}
	check((await fetch(`${B}/og/p/${postId}.png`)).status === 404, 'no preview image for a friends-only post');

	// ── Feed pagination ──
	for (let i = 0; i < 22; i++) await api(p, '/api/v1/posts', 'POST', { body: `Wpis numer ${i}`, visibility: 'public' });
	await friend.page.goto(B + '/', { waitUntil: 'networkidle' });
	const first = await friend.page.locator('[data-testid=feed] article').count();
	for (let i = 0; i < 6; i++) {
		await friend.page.mouse.wheel(0, 4000);
		await friend.page.waitForTimeout(400);
	}
	const after = await friend.page.locator('[data-testid=feed] article').count();
	check(first <= 21 && after > first, `infinite scroll loads more (${first} → ${after})`);

	// ── Report → hide ──
	await follower.page.goto(`${B}/p/${pub.json.id}`, { waitUntil: 'networkidle' });
	await follower.page.click('[data-testid=post-menu]');
	await follower.page.click('div[role=menu] button:has-text("Zgłoś")');
	await follower.page.click('[data-testid=send-report]');
	await follower.page.waitForSelector('text=Dziękujemy');
	if (process.env.DATABASE_URL) {
		const sql = require('postgres')(process.env.DATABASE_URL, { max: 1 });
		await sql`update profiles set role = 'admin' where handle = ${follower.handle}`;
		await sql.end();
		await follower.page.goto(B + '/admin/reports', { waitUntil: 'networkidle' });
		const art = follower.page.locator('article', { hasText: 'Publiczny' });
		check((await art.textContent()).includes('Publiczny'), 'admin queue shows the reported post text');
		await art.locator('[data-testid=hide]').click();
		await follower.page.waitForTimeout(500);
		check((await anon.goto(`${B}/p/${pub.json.id}`))?.status() === 404, 'hidden post is gone');
		check((await anon.goto(`${B}/u/${author.handle}`))?.status() === 200, 'author profile stays');
	}
} catch (e) {
	failed = true;
	console.error(e);
} finally {
	check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
	console.log(`screenshots: ${out}`);
	await browser.close();
	process.exit(failed ? 1 : 0);
}
