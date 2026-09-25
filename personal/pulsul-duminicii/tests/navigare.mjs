// Navigarea „ca într-o aplicație": pagini pregătite în fundal (niciodată /logout), „înapoi" din
// memorie (bfcache) doar cât pagina e încă valabilă, prima imagine a paginii completă.
//
// Chrome controlat de Playwright NU face prerender (PrerenderingDisabledByDevTools) și nu folosește
// bfcache (BackForwardCacheDisabledForDelegate). Testăm deci ce se vede și sub automatizare: ce
// pagini încearcă Chrome să pregătească, dacă pagina e eligibilă pentru bfcache (niciun motiv de
// blocare venit din pagină), și garda de reîncărcare — cu evenimentul pageshow pe care îl trimite
// Chrome la revenirea din memorie.
import { loggedIn, ANDROID } from './lib.mjs';
import { ADMIN, MARIUS, MARIUS_SUNDAY } from './fixtures.mjs';

export default async function navigare(t, { B, browser }) {
  const a = await loggedIn(t, B, browser, ADMIN, ANDROID);
  const cdp = await a.context().newCDPSession(a);
  const attempts = new Set(), statuses = new Map(), bfcacheBlocks = [];
  cdp.on('Preload.preloadingAttemptSourcesUpdated', (e) => e.preloadingAttemptSources.forEach((s) => attempts.add(new URL(s.key.url).pathname)));
  cdp.on('Preload.prerenderStatusUpdated', (e) => statuses.set(new URL(e.key.url).pathname, e.prerenderStatus || e.status));
  cdp.on('Page.backForwardCacheNotUsed', (e) => bfcacheBlocks.push(...e.notRestoredExplanations));
  await cdp.send('Preload.enable');
  await cdp.send('Page.enable');

  await a.goto(`${B}/program`);
  t.ok(await a.evaluate(() => !!document.getElementById('randat') && !!document.querySelector('link[rel=expect][blocking=render]')),
    'prima imagine așteaptă pagina completă (marker + blocking=render)');
  await a.waitForTimeout(2500);
  t.ok(['/', '/zile', '/categorii', '/predicatori'].every((p) => attempts.has(p)), `Chrome pregătește tab-urile în fundal (${[...attempts].join(', ')})`);

  // panoul de cont conține /logout — nu trebuie pregătit niciodată (prerender = chiar îl accesează)
  await a.click('#avatar-btn'); await a.waitForTimeout(300);
  await a.locator('dialog.sheet[open] a[href="/logout"]').dispatchEvent('pointerdown');
  await a.locator('dialog.sheet[open] a[href="/logout"]').hover().catch(() => {});
  await a.waitForTimeout(1200);
  await a.keyboard.press('Escape');
  t.ok(![...attempts].some((p) => p.startsWith('/logout') || p.startsWith('/login') || p.startsWith('/api/') || p.startsWith('/resurse/')),
    'niciodată pregătite: /logout, /login, /api, /resurse');
  const reason = [...statuses.values()][0];
  if (reason === 'PrerenderingDisabledByDevTools') t.note('prerender-ul propriu-zis nu rulează sub automatizare (PrerenderingDisabledByDevTools) — se vede doar pe telefon');

  // eligibil pentru bfcache: singurele motive de blocare trebuie să fie ale automatizării, nu ale paginii
  await a.locator(`a[href="/program/${MARIUS_SUNDAY}"]`).first().click();
  await a.waitForURL(`${B}/program/${MARIUS_SUNDAY}`);
  await a.goBack(); await a.waitForTimeout(800);
  const pageCaused = bfcacheBlocks.filter((x) => x.type === 'PageSupportNeeded').map((x) => x.reason);
  t.ok(bfcacheBlocks.length > 0 && !pageCaused.length, `pagina e eligibilă pentru „înapoi" instant${pageCaused.length ? ' — blocaje: ' + pageCaused.join(', ') : ''}`);
  if (bfcacheBlocks.some((x) => x.reason === 'BackForwardCacheDisabledForDelegate')) t.note('bfcache-ul propriu-zis nu rulează sub automatizare (BackForwardCacheDisabledForDelegate)');

  // garda de revenire: evenimentul pe care îl trimite Chrome când readuce pagina din memorie
  const restore = async (setup) => {
    await a.goto(`${B}/program`);
    await a.evaluate(() => { window.__marca = 1; });
    await a.evaluate(setup);
    await a.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await a.waitForTimeout(1200);
    return a.evaluate(() => window.__marca === 1);
  };
  t.ok(await restore(() => {}), 'revenire fără schimbări: pagina rămâne (instant)');
  t.ok(!(await restore(() => sessionStorage.setItem('puls-changed-at', String(Date.now() + 1000)))), 'revenire după o modificare: pagina se reîncarcă');
  t.ok(!(await restore(() => sessionStorage.setItem('puls-user', ''))), 'revenire după Ieșire / alt cont: pagina se reîncarcă');
  await a.context().close();

  // antetul de la Ieșire, verificat direct (redirecționarea 303 nu apare în evenimentele paginii)
  const login = await fetch(`${B}/login`, {
    method: 'POST', redirect: 'manual', headers: { origin: B, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: MARIUS.username, password: MARIUS.password, next: '' }),
  });
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const out = await fetch(`${B}/logout`, { redirect: 'manual', headers: { cookie } });
  t.ok(out.status === 303 && out.headers.get('clear-site-data') === '"cache"', 'Ieșire trimite Clear-Site-Data: "cache" (golește și memoria pentru „înapoi")');

  // Ieșire reală, apoi „înapoi": nu mai apar statisticile
  const m = await loggedIn(t, B, browser, MARIUS, ANDROID);
  await m.goto(`${B}/eu`);
  await m.click('#avatar-btn'); await m.waitForTimeout(300);
  await Promise.all([m.waitForURL(`${B}/login`), m.locator('dialog.sheet[open] a[href="/logout"]').click()]);
  await m.goBack(); await m.waitForLoadState('load'); await m.waitForTimeout(500);
  const leaked = await m.evaluate(() => (document.querySelector('h1')?.textContent || '').startsWith('Salut'));
  t.ok(!leaked, `după Ieșire, „înapoi" nu arată statisticile (am ajuns pe ${new URL(m.url()).pathname})`);
  await m.context().close();
}
