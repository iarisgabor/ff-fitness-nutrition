// Aplicația instalabilă: instalabilitate, service worker, offline, semnal slab, ștergere la Ieșire.
// Notă: context.setOffline din Playwright nu oprește cererile service worker-ului — „fără rețea"
// se simulează cu context.route(...abort), pornit cu PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 (vezi run.mjs).
import { loggedIn, ANDROID } from './lib.mjs';
import { MARIUS, MARIUS_SUNDAY, OTHER_UPCOMING } from './fixtures.mjs';

export default async function pwa(t, { B, browser }) {
  const pg = await loggedIn(t, B, browser, MARIUS, ANDROID);
  const ctx = pg.context();
  let offline = false, slowPath = null;
  await ctx.route('**/*', async (r) => {
    if (offline) return r.abort('internetdisconnected');
    if (slowPath && r.request().url().endsWith(slowPath)) await new Promise((x) => setTimeout(x, 9000));
    return r.continue().catch(() => {});
  });
  await pg.evaluate(() => navigator.serviceWorker.ready);
  await pg.reload();
  t.ok(await pg.evaluate(() => !!navigator.serviceWorker.controller), 'service worker-ul controlează pagina');
  const cdp = await ctx.newCDPSession(pg);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  t.ok(inst.installabilityErrors.length === 0, `instalabilă după criteriile Chrome ${inst.installabilityErrors.length ? JSON.stringify(inst.installabilityErrors) : ''}`);
  const man = await cdp.send('Page.getAppManifest');
  t.ok(!man.errors.length, `manifest fără erori ${man.errors.length ? JSON.stringify(man.errors) : ''}`);

  await pg.goto(`${B}/program`); await pg.goto(`${B}/program/${MARIUS_SUNDAY}`); await pg.goto(`${B}/cont`);
  await pg.waitForTimeout(500);
  const saved = await pg.evaluate(async () => (await (await caches.open('puls-pages')).keys()).map((k) => new URL(k.url).pathname));
  t.ok(saved.includes(`/program/${MARIUS_SUNDAY}`) && saved.includes('/eu'), `pagini salvate: ${saved.join(', ')}`);
  t.ok(!saved.includes('/cont') && !saved.includes('/login'), '/cont și /login nu se salvează');

  slowPath = `/program/${MARIUS_SUNDAY}`;
  const t0 = Date.now();
  await pg.goto(`${B}/program/${MARIUS_SUNDAY}`);
  const dt = Date.now() - t0;
  const slowBanner = await pg.locator('#offline-banner').textContent().catch(() => '');
  t.ok(slowBanner.startsWith('Conexiune slabă') && dt < 8500, `semnal slab: după ${(dt / 1000).toFixed(1)}s apare copia salvată`);
  slowPath = null;
  await pg.waitForTimeout(3500);

  offline = true; await ctx.setOffline(true);
  await pg.goto(`${B}/program/${MARIUS_SUNDAY}`);
  t.ok((await pg.locator('.plan-row').count()) > 5, 'offline: programul duminicii se deschide din copia salvată');
  const banner = await pg.locator('#offline-banner').textContent().catch(() => '');
  t.ok(banner.startsWith('Offline — versiunea salvată'), 'offline: banda arată ora salvării');
  await pg.locator('.plan-row', { hasText: 'Predică' }).first().click();
  await pg.click('#f-save'); await pg.waitForTimeout(300);
  t.ok((await pg.locator('#toast').textContent()).startsWith('Ești offline'), 'offline: salvarea e refuzată cu mesaj clar');
  await pg.goto(`${B}/program/${OTHER_UPCOMING}`);
  t.ok((await pg.locator('h1').textContent()) === 'Ești offline', 'offline: pagina nevizitată arată „Ești offline"');
  const links = await pg.locator('#saved-list a').allTextContents();
  t.ok(links.some((x) => x.startsWith('Program ·')), `offline: lista paginilor salvate (${links.length})`);
  await pg.goto(`${B}/`);
  t.ok((await pg.locator('h1').textContent()).startsWith('Salut'), 'offline: pornirea aplicației („/") deschide /eu salvat');
  offline = false; await ctx.setOffline(false);

  await pg.goto(`${B}/program/${MARIUS_SUNDAY}`);
  t.ok(await pg.evaluate(() => typeof window.PULS_SAVED_AT === 'undefined') && (await pg.locator('#offline-banner').count()) === 0, 'online: pagina vine de la server, fără bandă');
  await pg.locator('.plan-row', { hasText: 'Predică' }).first().click();
  await pg.fill('#f-notes', 'online după offline');
  await pg.click('#f-save'); await pg.waitForTimeout(700);
  t.ok((await pg.locator('#toast').textContent()) === 'Salvat.', 'online: salvarea merge normal');
  await pg.goto(`${B}/logout`); await pg.waitForTimeout(300);
  const after = await pg.evaluate(async () => caches.keys());
  t.ok(!after.includes('puls-pages'), 'ieșire: paginile salvate s-au șters');
  await ctx.close();
}
