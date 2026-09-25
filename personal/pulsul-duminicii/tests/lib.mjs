// Utilitare comune suitelor: browser, login, verificări.
import { chromium, devices } from 'playwright-core';

export { devices };
export const PHONE = devices['iPhone 13'];
export const ANDROID = devices['Pixel 7'];
export const DESKTOP = { viewport: { width: 1280, height: 860 } };

// Chromium: întâi cel din PLAYWRIGHT_BROWSERS_PATH / `npx playwright-core install chromium`,
// apoi Chrome sau Edge instalat pe calculator, sau CHROMIUM_PATH.
export async function launchBrowser() {
  const tries = [process.env.CHROMIUM_PATH && { executablePath: process.env.CHROMIUM_PATH }, {}, { channel: 'chrome' }, { channel: 'msedge' }].filter(Boolean);
  let last;
  for (const opts of tries) {
    try { return await chromium.launch(opts); } catch (err) { last = err; }
  }
  throw new Error(`Nu găsesc un Chromium. Rulează „npx playwright-core install chromium" sau setează CHROMIUM_PATH.\n${last?.message || ''}`);
}

export class Checks {
  constructor(suite) { this.suite = suite; this.fails = 0; this.count = 0; }
  ok(cond, msg) {
    this.count++;
    if (!cond) this.fails++;
    console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  }
}

// Context nou, logat; orice eroare JS sau fereastră nativă (alert/confirm) e o eroare de test.
export async function loggedIn(t, B, browser, user, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || PHONE);
  const pg = await ctx.newPage();
  watch(t, pg);
  await pg.goto(`${B}/login`);
  await pg.fill('[name=username]', user.username);
  await pg.fill('[name=password]', user.password);
  await Promise.all([pg.waitForNavigation(), pg.click('button[type=submit]')]);
  return pg;
}
export function watch(t, pg) {
  pg.on('pageerror', (e) => t.ok(false, `eroare JS pe ${pg.url()}: ${e.message}`));
  pg.on('dialog', (d) => { t.ok(false, `fereastră nativă: ${d.message()}`); d.dismiss().catch(() => {}); });
}

// Glisare cu degetul (evenimente touch reale, prin CDP).
export async function swipe(pg, selector, dx) {
  await pg.locator(selector).scrollIntoViewIfNeeded();
  const box = await pg.locator(selector).boundingBox();
  const cdp = await pg.context().newCDPSession(pg);
  const y = box.y + box.height / 2, x0 = box.x + box.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 6, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pg.waitForTimeout(250);
}
