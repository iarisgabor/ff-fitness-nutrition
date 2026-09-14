# CLAUDE.md — pulsul-duminicii

Site live de statistici pentru feedback-ul de duminică al bisericii. Un singur Cloudflare
Worker: la fiecare vizită citește Google Sheet-ul din spatele formularului „Evaluare
întâlnire duminică", agregă și randează HTML. **Nu există frontend separat, nici build
step, nici cron** — automatizarea cerută (raport proaspăt lunea) e implicită, fiindcă
totul e live.

> **Setup operațional (service account Google, secrete, deploy, verificare end-to-end):
> `README.md` din acest folder.** Fișierul de față e harta de cod + deciziile de design.

Designul e evoluat din raportul static făcut manual o singură dată:
`../librarie/pulsul-duminicii.html` (referință vizuală, nu cod folosit).

## Pagini și rute

| Rută | Randată de | Șablon |
|---|---|---|
| `/` — statistici generale | `renderHome()` | `src/home.html` |
| `/zile` — lista de duminici | `renderDaysList()` | `src/days.html` |
| `/zile/:slug` — o duminică (slideshow/dashboard pe categorie) | `renderDay()` | `src/day.html` |
| `/categorii` — index + matrice de corelații | `renderCategoriesIndex()` | `src/categories.html` |
| `/categorii/:cheie` — o categorie în timp, interval selectabil | `renderCategoryDetail()` | `src/category.html` |
| `/predicatori` — index predicatori + comparație pe dimensiuni | `renderPreachersIndex()` | `src/predicatori.html` |
| `/predicatori/:slug` — un predicator: notă la Predică, trend, comparație vs restul, citate | `renderPreacherDetail()` | `src/predicator.html` |

Slug de zi = `YYYY-MM-DD`; cheie de categorie = `q1`,`q2`,`q3`,`q5`…`q8` (vezi `config.js`);
slug de predicator = numele normalizat (`src/preachers.js:preacherSlug`, ex. „Beni Oz" → `beni-oz`).

## Unde te duci

| Cauți | Fișier |
|---|---|
| rutare, headere, handler `scheduled()` (neactivat) | `src/index.js` |
| poarta de acces (`AUTH_MODE`) | `src/auth.js` |
| **maparea coloană-Sheet → categorie** (Sheet de feedback) | `src/config.js` |
| rânduri brute → răspunsuri + toate agregatele | `src/transform.js` |
| **al DOILEA Sheet — „Calendar predicare"**: coloane → schedule, slug de nume | `src/preachers.js` (mapare în `config.js`, `PREACHER_COLUMNS`/`PREACHERS_SHEET_RANGE`) |
| orchestrare fetch→transform→randare + cache | `src/render.js` |
| auth Google prin service account (JWT semnat cu `crypto.subtle`) — comun ambelor Sheet-uri | `src/sheets.js` |
| rezumat AI per duminică | `src/aiSummary.js` |
| analiză AI de tendință per categorie | `src/aiTrendSummary.js` |
| CSS + JS comune tuturor paginilor | `src/shared.css`, `src/shared.txt` |
| `AUTH_MODE`, `GOOGLE_SHEET_ID`, binding KV | `wrangler.toml` |

## Cum se leagă șabloanele

`.html`, `.css` și `.txt` din `src/` sunt importate **ca text brut** (regula `[[rules]]`
type `Text` din `wrangler.toml`), nu servite static. `render.js` înlocuiește trei markere
în fiecare șablon: `__SHARED_CSS__`, `__SHARED_JS__`, `__PULS_DATA_JSON__`.

`shared.txt` **nu e un modul ES** — se injectează brut la începutul fiecărui `<script>`,
deci variabilele lui sunt globale în pagină. Extensia e `.txt` doar ca să intre în regula
de import ca text.

## Reguli care nu se văd din cod

1. **`src/config.js` e singurul fișier de atins dacă se schimbă formularul.** Verificat
   contra Sheet-ului real (2026-09-07): tab-ul e „Răspunsuri la formular 1", `q4` lipsește
   real din formular, iar fiecare coloană de rating e urmată imediat de coloana ei de text.
   `keywords` identifică doar coloana de **rating**; cea de text e luată automat ca
   „următoarea coloană", fiindcă headerul ei nu repetă tema dimensiunii.
2. **Apelurile AI sunt non-blocante, mereu.** Pattern-ul, în ambele fișiere `ai*.js`:
   citește rapid din KV; dacă lipsește, randează pagina **fără** rezumat și pornește
   generarea cu `ctx.waitUntil()` — apare la vizita următoare. Pagina nu așteaptă niciodată
   după Claude.
3. **Cheia de cache AI e hash-ul conținutului**, nu data — rezumatul se recalculează
   automat doar când vine un răspuns nou/întârziat pentru acea zi.
4. **Analiza de tendință există doar pentru presetup-uri** (1/3/6/12 luni, Tot).
   „Personalizat" ar însemna combinații nelimitate, imposibil de cache-uit — acolo nu apare.
   `weeksForPreset()` folosește aceeași logică „acum minus N luni" ca `currentBounds()` din
   `category.html`, ca textul AI să descrie exact fereastra desenată pe grafic.
5. **Stale-while-revalidate, fail-open:** la eșec de fetch se întoarce ultima versiune bună
   din KV (`sheet_payload:last_good`, fără TTL) cu flag `stale` → banner „date posibil
   neactualizate". 503 doar dacă nu există nicio versiune bună.
6. **Se cache-uiește JSON-ul transformat, nu HTML-ul** (`sheet_payload`, TTL 10 min).
7. **`safeJsonForScript()` scapă `<`** — `JSON.stringify` nu o face, iar un text liber cu
   `</script` ar rupe pagina. Textele vin de la membri, sunt conținut nesigur.
8. **Fără AI configurat, site-ul funcționează normal** — blocurile AI pur și simplu nu apar.
   `ANTHROPIC_API_KEY` e opțional prin design.
9. **Token-ul Google se cache-uiește în KV 50 min** (față de 3600s reali) — service account,
   fără OAuth interactiv și fără refresh token, spre deosebire de Gmail/Calendar din
   celelalte proiecte.
10. **Link neafișat public, fără parolă** (`AUTH_MODE = "none"`, decizie explicită) +
    `x-robots-tag: noindex`. Conținutul include nume și reflecții personale — **nu
    distribui linkul public**.
11. **`scheduled()` e scris dar neactivat** (fără `[triggers]` în `wrangler.toml`).
    Dacă cineva vrea refresh strict programat lunea: adaugă cronul și, opțional, scoate
    fetch-ul live din `fetch()`. Ambele seam-uri (acces + refresh) sunt intenționat izolate.
12. **„Calendar predicare" e un Sheet complet SEPARAT** (`PREACHERS_SHEET_ID`,
    `1LVHzHB4z_dGm5v9xsnp_i2NotgUVGnBdmzpv3XsWpN0`, deținut de altcineva decât Sheet-ul
    de feedback) — același service account trebuie adăugat Viewer și pe acesta (vezi
    README). `fetchSheetValues()` din `sheets.js` ia `sheetId`+`range` ca parametri
    tocmai ca să poată citi ambele Sheet-uri cu același token.
13. **„Beni I" și „Beni Oz" sunt DOI predicatori diferiți**, confirmat explicit (nu o
    eroare de tastare în Sheet) — `preacherSlug()` îi ține separați (`beni-i` / `beni-oz`).
    Dacă apare vreodată un al treilea "Beni" în Sheet, nu presupune că e unul din cei doi.
14. **Statisticile per-predicator pornesc de la 30/08/2026** — cea mai veche dată din
    „Calendar predicare" la data scrierii acestei funcționalități (2026-09-14). Duminicile
    de feedback mai vechi de atât rămân neatribuite (decizie explicită — nu există o listă
    de-a cui a predicat înainte de acea dată).
15. **Eroarea de citire a calendarului de predicare e izolată, nu dărâmă site-ul.**
    `getSchedule()` din `render.js` nu aruncă niciodată dacă `PREACHERS_SHEET_ID` lipsește
    sau fetch-ul eșuează fără cache anterior — întoarce `{ schedule: [], error: '...' }` și
    `/predicatori` arată un mesaj, în loc de 503. Paginile `/`, `/zile`, `/categorii` nu
    depind deloc de acest Sheet.
16. **`/zile/:slug` arată predicatorul zilei** (dacă există o potrivire de dată în calendar),
    cu link spre `/predicatori/:slug` — cules din `getSchedule()`, nu din Sheet-ul de feedback.

## Comenzi

```bash
npm install
cp .dev.vars.example .dev.vars   # completează cu valori reale sau de test
npm run dev
npx wrangler deploy
npx wrangler tail
```

## Config și secrete

`[vars]` în `wrangler.toml`: `AUTH_MODE` (`none` | `password` | `access`),
`GOOGLE_SHEET_ID` (`1NIRVF-Dfxbu3BweApf9eWhMW80ZLeXw6RGPAVAQieic` — deținut de
`butmarius@gmail.com`; service account-ul trebuie adăugat Viewer de cineva cu drept de
editare pe el). KV: `PULSUL_KV`.

Secrete: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
`SITE_PASSWORD` (doar la `AUTH_MODE = "password"`), `ANTHROPIC_API_KEY` (opțional).

## Model

`claude-haiku-4-5` în ambele fișiere de AI (`src/aiSummary.js:41`,
`src/aiTrendSummary.js:122`), prin `fetch()` direct — fără SDK, ca peste tot în acest repo.
