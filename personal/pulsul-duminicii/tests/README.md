# Teste — Pulsul Duminicii

```bash
npm install
npm test                    # toate suitele (~75s)
npm test -- pwa aspect      # doar unele
npm test -- --capturi       # + capturi de ecran în tests/capturi/ (ignorat de git)
```

`npm test` face totul singur: pornește site-ul local (`wrangler dev`, port 8788) pe o stare
**separată** — `.wrangler/test-state`, ștearsă la fiecare rulare — cu date sintetice, creează
conturile și duminicile prin API, rulează suitele în Chromium, oprește serverul. Nu atinge
Sheet-urile reale, D1/KV/R2 din producție sau starea ta de `npm run dev`. Parola de test și
AI-ul oprit (`--var`) suprascriu orice ai în `.dev.vars`.

## Ce verifică

| Suită | Ce |
|---|---|
| `regresie` | comportamentul de dinainte de aplicație, pe telefon și desktop: editorul de program, **permisiunile pe server** (predicatorul primește 403 în afara secțiunii lui), redirecționările predicatorului, slideshow-ul, intervalele |
| `telefon` | glisarea între răspunsuri, trecerea la categoria următoare, starea ținută minte, „Duminică nouă" în panou, urcarea cu progres + descărcarea identică, dialogurile de ștergere, offline, conturile (creare / resetare / ștergere), „arată parola" |
| `iphone` | sugestia de instalare (o singură dată) și pașii Share → Adaugă pe ecranul principal |
| `aspect` | toate paginile, pe roluri, pe telefon (luminos + întunecat) și desktop: nimic nu iese din ecran, nicio eroare JS, pe telefon niciun câmp sub 16px și nicio țintă de atingere sub 40px |
| `pwa` | instalabilitatea (criteriile Chrome), service worker-ul, paginile salvate, semnal slab (copia după 6s), offline, pagina offline, ștergerea copiilor la Ieșire |

Orice eroare JS sau fereastră nativă (`alert`/`confirm`) pe o pagină face testul să pice.

## Date

`fixtures.mjs` le generează **relativ la ziua de azi**: 28 de duminici de feedback până la ultima
duminică, un calendar de predicare (5 duminici trecute + 12 viitoare, Laviniu / Marius / Beni I /
Beni Oz) și programe pentru ultima duminică și următoarele trei. Conturi: `BisericaLogos` /
`test-admin-parola` și predicatorul `marius` / `parola-marius-test` — doar în starea de test.

## Browser

Folosește `playwright-core` (fără descărcare automată de browsere). Caută, în ordine:
`CHROMIUM_PATH`, Chromium-ul instalat cu `npx playwright-core install chromium`, apoi Chrome
sau Edge de pe calculator.

## Când adaugi ceva

- o pagină nouă → adaug-o în lista din `aspect.mjs`;
- o permisiune nouă → un test în `regresie.mjs` care o încearcă **direct pe API** (pagina doar
  ascunde butoanele; regula e pe server);
- o rută care nu trebuie salvată offline → verifică și în `pwa.mjs`.
