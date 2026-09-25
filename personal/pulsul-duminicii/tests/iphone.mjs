// Instalarea pe iPhone (fără prompt de browser): sugestia o singură dată + pașii Share → Adaugă.
import { PHONE, watch } from './lib.mjs';
import { MARIUS } from './fixtures.mjs';

export default async function iphone(t, { B, browser }) {
  const ctx = await browser.newContext(PHONE);
  const pg = await ctx.newPage();
  watch(t, pg);
  await pg.goto(`${B}/login`); await pg.waitForTimeout(1800);
  t.ok((await pg.locator('#install-hint').count()) === 0, 'pe /login nu apare sugestia');
  await pg.fill('[name=username]', MARIUS.username); await pg.fill('[name=password]', MARIUS.password);
  await Promise.all([pg.waitForNavigation(), pg.click('button[type=submit]')]);
  await pg.waitForSelector('#install-hint', { timeout: 4000 }).catch(() => {});
  t.ok(await pg.locator('#install-hint').isVisible(), 'după login apare sugestia de instalare');
  await pg.click('#install-hint [data-install]'); await pg.waitForTimeout(300);
  t.ok((await pg.locator('dialog.sheet[open] .ios-steps').textContent()).includes('Adaugă pe ecranul principal'), '„Cum?" arată pașii Share → Adaugă');
  await pg.click('dialog.sheet[open] [data-ok]'); await pg.waitForTimeout(300);
  await pg.goto(`${B}/program`); await pg.waitForTimeout(1800);
  t.ok((await pg.locator('#install-hint').count()) === 0, 'după „Am înțeles" sugestia nu mai apare');
  await pg.click('#avatar-btn'); await pg.waitForTimeout(300);
  t.ok((await pg.locator('dialog.sheet[open] #install-slot').textContent()).includes('Instalează pe iPhone'), 'panoul de cont păstrează „Instalează pe iPhone"');
  await ctx.close();
}
