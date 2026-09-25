// Aspectul fiecărei pagini, pe roluri, pe telefon (luminos + întunecat) și desktop: nimic nu iese
// din ecran, nicio eroare JS; pe telefon — niciun câmp sub 16px (zoom iOS) și nicio țintă sub 40px.
// Cu --capturi, salvează și câte o captură în tests/capturi/.
import { mkdirSync } from 'node:fs';
import { loggedIn, PHONE, DESKTOP } from './lib.mjs';
import { ADMIN, MARIUS, MARIUS_SUNDAY, DAY_WITH_FEEDBACK } from './fixtures.mjs';

const PAGES = {
  admin: ['/', '/zile', `/zile/${DAY_WITH_FEEDBACK}`, '/categorii', '/categorii/q5', '/predicatori', '/predicatori/marius', '/program', `/program/${MARIUS_SUNDAY}`, '/admin/conturi'],
  marius: ['/eu', '/program', `/program/${MARIUS_SUNDAY}`, '/cont'],
};

export default async function aspect(t, { B, browser, shots }) {
  const variants = [['telefon', PHONE, 'light'], ['telefon', PHONE, 'dark'], ['desktop', DESKTOP, 'light']];
  for (const [form, opts, scheme] of variants) {
    for (const [who, user] of [['admin', ADMIN], ['marius', MARIUS]]) {
      const pg = await loggedIn(t, B, browser, user, { ...opts, colorScheme: scheme });
      const problems = [];
      for (const path of PAGES[who]) {
        await pg.goto(B + path, { waitUntil: 'networkidle' });
        const r = await pg.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const out = [...document.querySelectorAll('body *')].filter((el) => {
            const b = el.getBoundingClientRect();
            if (!b.width || getComputedStyle(el).position === 'fixed') return false;
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(a).overflowX)) return false;
            }
            return b.right > vw + 1;
          }).length;
          const zoom = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
            .filter((el) => el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 16).length;
          const small = [...document.querySelectorAll('a, button, [role=button], .toggle-opt, .cat-tab, input:not([type=hidden]), select, summary')]
            .filter((el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width && b.height && b.height < 40 && cs.visibility !== 'hidden'; })
            .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
          return { out, zoom, small };
        });
        if (r.out) problems.push(`${path}: ${r.out} elemente ies din ecran`);
        if (form === 'telefon' && r.zoom) problems.push(`${path}: ${r.zoom} câmpuri sub 16px`);
        if (form === 'telefon' && r.small.length) problems.push(`${path}: ținte mici ${[...new Set(r.small)].join(', ')}`);
        if (shots) {
          mkdirSync(new URL('./capturi/', import.meta.url), { recursive: true });
          await pg.screenshot({ path: new URL(`./capturi/${form}-${scheme}-${who}${path.replace(/\//g, '_') || '_'}.png`, import.meta.url).pathname });
        }
      }
      t.ok(!problems.length, `${form} ${scheme === 'dark' ? 'întunecat' : 'luminos'}, ${who}: ${PAGES[who].length} pagini${problems.length ? ' — ' + problems.join('; ') : ''}`);
      await pg.context().close();
    }
  }
}
