// Experiența de aplicație pe telefon: glisare, stare ținută minte, panouri, urcare cu progres,
// dialoguri în loc de alert/confirm/prompt, offline, conturi.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loggedIn, swipe, PHONE } from './lib.mjs';
import { ADMIN, MARIUS_SUNDAY, DAY_WITH_FEEDBACK } from './fixtures.mjs';

export default async function telefon(t, { B, browser }) {
  const a = await loggedIn(t, B, browser, ADMIN);
  const counter = () => a.locator('.slide-counter').textContent();

  await a.goto(`${B}/zile/${DAY_WITH_FEEDBACK}`);
  await swipe(a, '.slide-card', -160);
  t.ok((await counter()).startsWith('2 din'), 'zi: glisare stânga → răspunsul următor');
  await swipe(a, '.slide-card', 160);
  t.ok((await counter()).startsWith('1 din'), 'zi: glisare dreapta → înapoi');
  const n = Number((await counter()).split('din')[1]);
  for (let i = 1; i < n; i++) await a.click('#slide-next');
  const firstCat = await a.locator('.cat-tab.active').textContent();
  const nextLabel = await a.locator('#slide-next').textContent();
  await a.click('#slide-next');
  const secondCat = await a.locator('.cat-tab.active').textContent();
  t.ok(firstCat !== secondCat && nextLabel.includes(secondCat.replace(/\d+$/, '').trim()), `zi: la capăt, „${nextLabel.trim()}" trece la categoria următoare`);
  t.ok((await counter()).startsWith('1 din'), 'zi: noua categorie începe cu primul răspuns');
  await a.locator('.toggle-opt[data-view="dashboard"]').click();
  await a.reload();
  t.ok(await a.locator('#view-dashboard').isVisible(), 'zi: modul „Toate deodată" ținut minte');
  await a.locator('.toggle-opt[data-view="slideshow"]').click();

  await a.goto(`${B}/categorii/q5`);
  await a.locator('.toggle-opt[data-range="6"]').click();
  await a.goto(`${B}/categorii/q2`);
  t.ok((await a.locator('.toggle-opt.active').textContent()) === '6 luni', 'categorie: intervalul ales rămâne la altă categorie');
  await a.locator('.toggle-opt[data-range="all"]').click();

  await a.goto(`${B}/program`);
  await a.click('#new-btn'); await a.waitForTimeout(300);
  t.ok(await a.locator('dialog.sheet[open] #new-form').isVisible(), 'program: butonul plutitor deschide formularul în panou');
  await a.click('#new-cancel'); await a.waitForTimeout(300);
  t.ok(!(await a.locator('dialog.sheet[open]').count()) && (await a.locator('#new-form').count()) === 1, 'program: „Renunță" închide panoul');

  await a.goto(`${B}/program/${MARIUS_SUNDAY}`);
  const file = join(tmpdir(), 'pulsul-test-slides.pdf');
  writeFileSync(file, 'Slide-uri de test pentru predica.\n');
  const [chooser] = await Promise.all([a.waitForEvent('filechooser'), a.locator('#general-resources [data-upload]').click()]);
  await chooser.setFiles(file);
  await a.waitForSelector('#general-resources .res-item', { timeout: 8000 }).catch(() => {});
  t.ok((await a.locator('#general-resources .res-item', { hasText: 'pulsul-test-slides.pdf' }).count()) === 1, 'editor: fișierul urcat apare la resurse');
  t.ok(await a.locator('#upload-panel').isHidden(), 'editor: panoul de progres dispare după urcare');
  const dl = await a.evaluate(async () => {
    const r = await fetch(document.querySelector('#general-resources .res-item a').getAttribute('href'));
    return `${r.status} ${(await r.text()).trim()}`;
  });
  t.ok(dl.startsWith('200 Slide-uri de test'), 'editor: fișierul se descarcă identic');
  await a.locator('#general-resources [data-del-res]').first().click();
  t.ok(await a.locator('dialog.sheet[open] .btn.danger-solid').isVisible(), 'editor: ștergerea cere confirmare');
  await a.locator('dialog.sheet[open] [data-v="0"]').click(); await a.waitForTimeout(300);
  t.ok((await a.locator('#general-resources .res-item').count()) === 1, 'editor: „Renunță" păstrează resursa');
  await a.locator('#general-resources [data-del-res]').first().click();
  await a.locator('dialog.sheet[open] [data-v="1"]').click(); await a.waitForTimeout(700);
  t.ok((await a.locator('#general-resources .res-item').count()) === 0, 'editor: „Șterge" o șterge');

  await a.context().setOffline(true);
  await a.evaluate(() => window.dispatchEvent(new Event('offline')));
  t.ok(await a.locator('#offline-banner').isVisible(), 'offline: apare banda');
  await a.locator('.plan-row', { hasText: 'Predică' }).first().click();
  await a.click('#f-save'); await a.waitForTimeout(300);
  t.ok((await a.locator('#toast').textContent()).startsWith('Ești offline'), 'offline: salvarea spune clar de ce nu merge');
  await a.context().setOffline(false);
  await a.evaluate(() => window.dispatchEvent(new Event('online')));
  t.ok(await a.locator('#offline-banner').isHidden(), 'online: banda dispare');

  await a.goto(`${B}/admin/conturi`);
  await a.selectOption('#preacher-select', 'Laviniu');
  await a.click('#gen-pw');
  const pw = await a.inputValue('#password');
  await a.click('#new-form [type=submit]'); await a.waitForTimeout(600);
  const cred = await a.locator('dialog.sheet[open] .cred-list').textContent().catch(() => '');
  t.ok(cred.includes('laviniu') && cred.includes(pw), 'conturi: contul creat arată utilizatorul și parola');
  await a.click('dialog.sheet[open] [data-ok]'); await a.waitForTimeout(300);
  await a.locator('.acc-row', { hasText: 'Laviniu' }).locator('[data-reset]').click();
  t.ok(await a.locator('dialog.sheet[open] input[name=v]').isVisible(), 'conturi: resetarea cere parola nouă într-un dialog');
  await a.fill('dialog.sheet[open] input[name=v]', 'parola-noua-1');
  await a.click('dialog.sheet[open] [type=submit]'); await a.waitForTimeout(600);
  t.ok((await a.locator('dialog.sheet[open] .cred-list').textContent()).includes('parola-noua-1'), 'conturi: parola nouă e afișată');
  await a.click('dialog.sheet[open] [data-ok]'); await a.waitForTimeout(300);
  const l = await loggedIn(t, B, browser, { username: 'laviniu', password: 'parola-noua-1' });
  t.ok(new URL(l.url()).pathname === '/eu', 'conturi: predicatorul intră cu parola resetată');
  await l.context().close();
  await a.locator('.acc-row', { hasText: 'Laviniu' }).locator('[data-delete]').click();
  await a.click('dialog.sheet[open] [data-v="1"]'); await a.waitForTimeout(600);
  t.ok((await a.locator('.acc-row', { hasText: 'Laviniu' }).count()) === 0, 'conturi: ștergerea confirmată scoate contul');
  await a.context().close();

  const ctx = await browser.newContext(PHONE);
  const lp = await ctx.newPage();
  await lp.goto(`${B}/login`);
  await lp.fill('[name=password]', 'x');
  await lp.click('.pw-toggle');
  t.ok((await lp.getAttribute('[name=password]', 'type')) === 'text', 'login: butonul ochi arată parola');
  await ctx.close();
}
