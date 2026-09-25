// Comportamentul existent de dinainte de aplicație: editor, permisiuni pe server, slideshow, intervale.
import { loggedIn, PHONE, DESKTOP } from './lib.mjs';
import { ADMIN, MARIUS, MARIUS_SUNDAY, DAY_WITH_FEEDBACK } from './fixtures.mjs';

export default async function regresie(t, { B, browser }) {
  for (const [form, opts] of [['telefon', PHONE], ['desktop', DESKTOP]]) {
    console.log(`  — ${form}`);
    const a = await loggedIn(t, B, browser, ADMIN, opts);
    const row = (pg, title) => pg.locator('.plan-row', { hasText: title }).first();
    await a.goto(`${B}/program/${MARIUS_SUNDAY}`);
    const stamp = `test ${Date.now()}`;
    await row(a, 'Predică').click();
    t.ok(await a.locator('#drawer').isVisible(), 'admin: rândul „Predică" deschide panoul');
    await a.fill('#f-notes', stamp);
    await a.click('#f-save');
    await a.waitForTimeout(700);
    t.ok((await a.locator('#toast').textContent().catch(() => '')) === 'Salvat.', 'admin: salvare → „Salvat."');
    await a.reload();
    t.ok((await row(a, 'Predică').textContent()).includes(stamp), 'admin: notița salvată apare după reîncărcare');
    await a.goto(`${B}/program`);
    t.ok(await a.locator('.sunday-row').count() >= 3, 'admin: lista de duminici');

    const m = await loggedIn(t, B, browser, MARIUS, opts);
    await m.goto(`${B}/program/${MARIUS_SUNDAY}`);
    await row(m, 'Welcome').click();
    t.ok(await m.locator('#drawer').isVisible() && !(await m.locator('#f-save').count()), 'predicator: „Welcome" (INTRO) doar pentru citire');
    await m.keyboard.press('Escape');
    await row(m, 'Predică').click();
    t.ok(await m.locator('#f-save').count() === 1, 'predicator: „Predică" (secțiunea lui) e editabil');
    await m.keyboard.press('Escape');
    const status = await m.evaluate(async (date) => {
      const plan = await (await fetch(`/api/program/${date}`)).json();
      const welcome = plan.items.find((i) => i.title === 'Welcome');
      const r = await fetch(`/api/program/${date}/items/${welcome.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: 'x' }) });
      return r.status;
    }, MARIUS_SUNDAY);
    t.ok(status === 403, `predicator: PATCH pe INTRO refuzat pe server (${status})`);
    await m.goto(`${B}/`);
    t.ok(new URL(m.url()).pathname === '/eu', 'predicator: / → /eu');
    await m.goto(`${B}/categorii`);
    t.ok(new URL(m.url()).pathname === '/eu', 'predicator: /categorii → /eu');

    await a.goto(`${B}/zile/${DAY_WITH_FEEDBACK}`);
    const c1 = await a.locator('.slide-counter').textContent();
    await a.click('#slide-next');
    const c2 = await a.locator('.slide-counter').textContent();
    t.ok(c1.startsWith('1 din') && c2.startsWith('2 din'), `zi: slideshow înainte (${c1} → ${c2})`);
    await a.locator('.toggle-opt[data-view="dashboard"]').click();
    t.ok(await a.locator('#view-dashboard').isVisible(), 'zi: „Toate deodată"');
    await a.locator('.toggle-opt[data-view="slideshow"]').click();
    await a.goto(`${B}/categorii/q5`);
    await a.locator('.toggle-opt[data-range="custom"]').click();
    t.ok(await a.locator('#custom-range').isVisible(), 'categorie: „Personalizat" se poate apăsa');
    await a.locator('.toggle-opt[data-range="all"]').click();
    await a.context().close(); await m.context().close();
  }
}
