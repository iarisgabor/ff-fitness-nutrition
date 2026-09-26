# CLAUDE.md — pulsul-duminicii

Site live de statistici pentru feedback-ul de duminică al bisericii, plus **programul de
duminică** (editor în stilul Planning Center, cu resurse urcate) și **conturi**: contul general
`BisericaLogos` vede tot (Analiză + Program), fiecare predicator își vede doar statisticile
și duminicile care urmează. Un singur Cloudflare Worker: la fiecare vizită citește Google
Sheet-ul din spatele formularului „Evaluare întâlnire duminică", agregă și randează HTML;
programul stă în D1, fișierele în R2, sesiunile în KV. **Nu există frontend separat, nici build
step, nici cron** — automatizarea cerută (raport proaspăt lunea) e implicită, fiindcă
totul e live.

Din 2026-09-25 e și **aplicație instalabilă (PWA)**, gândită întâi pentru telefon: bară de
aplicație + bară de navigare jos, panouri de jos, service worker cu acces offline la paginile
deja deschise. Tot pe aceeași arhitectură — șabloanele randate pe server au rămas; s-au adăugat
doar fișiere statice în `public/` (servite de Cloudflare, fără build step). Vezi regulile 21–30.

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
| `/predicatori/:slug` — un predicator: notă la Predică, trend, comparație vs restul, prezență, duminici următoare, citate | `renderPreacherDetail()` | `src/predicator.html` |
| `/eu` — același conținut, pentru predicatorul logat (`self: true`) | `renderMe()` | `src/predicator.html` |
| `/login`, `/logout`, `/cont` (predicatorul își schimbă parola) | `renderLogin()` | `src/login.html` |
| `/program` — lista duminicilor (următoare + trecute) + „Duminică nouă" | `renderProgramList()` | `src/program-list.html` |
| `/program/:data` — editorul unei duminici (rânduri, panou lateral, resurse) | `renderProgramEdit()` | `src/program-edit.html` |
| `/admin/conturi` — conturile predicatorilor | `renderAccounts()` | `src/admin-accounts.html` |
| `/api/program/...`, `/api/resurse/:id` — JSON, folosit de editor | `handleProgramApi()` | — |
| `/api/conturi/...`, `/api/parola` — JSON | `handleAccountsApi()` | — |
| `/resurse/:id` — descărcarea unui fișier din R2, după verificarea accesului | `serveResource()` | — |
| `/api/app/…` — aceleași date ca paginile, ca JSON, pentru aplicația nativă (+ `login`, `logout`, `sesiune`) | `handleAppApi()` | — |

**Cine vede ce** (gardă în `src/index.js`): `admin` — tot. `preacher` — `/eu`, `/cont`, `/program`,
`/program/:data`, `/resurse/:id` și `/zile/:slug` **doar** pentru duminicile lui din calendar;
orice altă pagină de Analiză îl redirecționează la `/eu`.

Slug de zi = `YYYY-MM-DD`; cheie de categorie = `q1`,`q2`,`q3`,`q5`…`q8` (vezi `config.js`);
slug de predicator = numele normalizat (`src/preachers.js:preacherSlug`, ex. „Beni Oz" → `beni-oz`).

## Unde te duci

| Cauți | Fișier |
|---|---|
| rutare, headere, handler `scheduled()` (neactivat) | `src/index.js` |
| poarta de acces (`AUTH_MODE`) | `src/auth.js` |
| parole (PBKDF2), sesiuni în KV, limită de login, verificare Origin | `src/session.js` |
| conturile predicatorilor (D1 `users`) | `src/accounts.js` |
| **permisiunile pe program** + CRUD duminici/elemente/resurse + R2 | `src/program.js` |
| șablonul unei duminici noi (INTRO/WORSHIP/PREDICA/ÎNCHEIERE) | `src/programTemplate.js` |
| schema D1 | `migrations/0001_program.sql` |
| **maparea coloană-Sheet → categorie** (Sheet de feedback) | `src/config.js` |
| rânduri brute → răspunsuri + toate agregatele | `src/transform.js` |
| **al DOILEA Sheet — „Calendar predicare"**: coloane → schedule, slug de nume | `src/preachers.js` (mapare în `config.js`, `PREACHER_COLUMNS`/`PREACHERS_SHEET_RANGE`) |
| **al TREILEA Sheet — „Participare parteneri"**: prezența, fetch + cache + parsare | `src/attendance.js` (`ATTENDANCE_SHEET_RANGE` în `config.js`) |
| orchestrare fetch→transform→randare + cache | `src/render.js` |
| auth Google prin service account (JWT semnat cu `crypto.subtle`) — comun ambelor Sheet-uri | `src/sheets.js` |
| rezumat AI per duminică | `src/aiSummary.js` |
| analiză AI de tendință per categorie | `src/aiTrendSummary.js` |
| CSS + JS comune tuturor paginilor: navigarea pe roluri (`initNav` — bara de sus, bara de jos pe telefon, sub-tab-urile de pe desktop), panouri (`openSheet`), dialoguri (`confirmDialog`/`promptDialog`/`credentialsDialog`), `api()`, `withBusy()`, `toast()`, offline, instalare | `src/shared.css`, `src/shared.txt` |
| `<head>` comun (viewport, theme-color, manifest, iconițe, preload font) | `src/head.html` |
| fișiere statice publice: fonturi (`fonts/` + `OFL.txt`), iconițe, `favicon.svg`, `manifest.webmanifest`, **`sw.js`** (service worker), `offline.html`, antete (`_headers`), `.well-known/assetlinks.json` (legătura cu aplicația Android) | `public/` |
| aplicația Android (Trusted Web Activity, generată cu Bubblewrap) + build în GitHub Actions | `android/` (`android/README.md`), `.github/workflows/android-pulsul-duminicii.yml` |
| **aplicația Android nativă** (Kotlin + Compose, separată de TWA) | `android-nativ/` (`android-nativ/README.md`) |
| API-ul JSON al aplicației native | `src/appApi.js` |
| testele (`npm test`) | `tests/` (`tests/README.md`) |
| `AUTH_MODE`, `ADMIN_USERNAME`, `GOOGLE_SHEET_ID`, binding-uri KV/D1/R2 | `wrangler.toml` |

## Cum se leagă șabloanele

`.html`, `.css` și `.txt` din `src/` sunt importate **ca text brut** (regula `[[rules]]`
type `Text` din `wrangler.toml`), nu servite static. `render.js` înlocuiește patru markere
în fiecare șablon: `__SHARED_HEAD__`, `__SHARED_CSS__`, `__SHARED_JS__`, `__PULS_DATA_JSON__` — prin
`fillPage()`, care folosește funcție ca al doilea argument la `replace()` (un text de la membri
cu `$&` sau `$'` ar fi fost altfel interpretat ca tipar de înlocuire). Înaintea lui
`__SHARED_JS__` se injectează `const PULS_USER = {...}` (rol, nume) — de aici știe `initNav`
ce meniu să arate.

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
10. **Acces cu conturi** (`AUTH_MODE = "accounts"`, schimbat 2026-09-24 din `"none"`) +
    `x-robots-tag: noindex`. Conținutul include nume și reflecții personale.
    - Contul general (`ADMIN_USERNAME`, implicit `BisericaLogos`) **nu stă în D1**: parola e
      `ADMIN_PASSWORD_HASH` din `wrangler.toml` (PBKDF2 al unei parole ALEATOARE generate cu
      `scripts/admin-password.mjs` — de-asta poate sta public în repo) sau, cu prioritate,
      secretul `ADMIN_PASSWORD`. Sesiunea de admin ține o amprentă a parolei — orice schimbare
      a ei delogează toate sesiunile de admin.
    - Predicatorii sunt în D1 (`users`), parole PBKDF2-SHA256 100k iterații (plafonul
      Workers). Resetarea de către admin crește `session_gen` → predicatorul e delogat peste tot;
      schimbarea propriei parole nu (ar deloga și sesiunea din care o schimbă).
    - Sesiuni în KV (`session:<token>`, 30 zile), cookie `HttpOnly; Secure; SameSite=Lax`.
      Orice POST/PATCH/PUT/DELETE trebuie să aibă `Origin` = site-ul (`isSameOrigin`).
    - Login blocat 15 min după 10 încercări greșite de pe același IP (`login_fail:<ip>` în KV).
    - `AUTH_MODE = "none"`/`"password"` încă merg, dar atunci **toată lumea e admin** (inclusiv
      pe editorul de program) — doar pentru teste locale.
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
17. **Permisiunile pe program se verifică pe server, în `src/program.js`** — pagina doar ascunde
    butoanele. Predicatorul (potrivire prin `preacherSlug()`, deci „Beni I" ≠ „Beni Oz"):
    - vede toate duminicile următoare + doar duminicile lui trecute;
    - la duminica lui: editează/adaugă/șterge elemente **doar în secțiunea PREDICA** (secțiunea
      = cel mai apropiat rând `header` de deasupra al cărui titlu conține „predic") și urcă
      resurse oriunde în acea duminică;
    - în orice duminică: editează elementele unde câmpul „Cine" e exact numele lui.
    - Nu poate: crea/șterge duminici, reordona, schimba predicatorul/prezența/notițele generale.
18. **Resursele: bucket R2 privat, servit doar prin `/resurse/:id`** după aceeași verificare
    de vizibilitate. Extensii permise listate în `program.js` (fără html/svg/js — n-au voie să
    ruleze cod pe domeniul nostru); plus `content-security-policy: sandbox` și `nosniff` la
    descărcare. Max 50 MB, urcare ca body brut (nu multipart) ca să curgă direct în R2.
    Fără R2 configurat, urcarea răspunde 503 și merg doar linkurile.
19. **Prezența vine dintr-un al TREILEA Sheet** ("Participare parteneri", `ATTENDANCE_SHEET_ID`,
    `src/attendance.js`), nu se mai trece manual în Program duminică — câmpul e doar de citit
    acum (alăturat pe dată, `attendanceForSlug`). Sheet-ul are o coloană 0/1 per membru (ignorată);
    citim doar coloanele agregate `Total parteneri`/`Musafiri`/`Total`, cu match EXACT pe header
    (nu `containsAny` ca la celelalte Sheet-uri — „Total" și „Total parteneri" conțin amândouă
    cuvântul „total"). Fetch-ul + cache-ul stau în `attendance.js`, NU în `render.js` ca la
    `getSchedule` — `program.js` (rutele de scriere ale Programului) au nevoie de prezență ca să
    răspundă cu date proaspete după fiecare salvare, și un import din `render.js` ar crea un ciclu.
    Statisticile predicatorului se alătură pe dată cu „Calendar predicare" (ca la `responses`),
    nu mai pe `preacher_name` din D1. Coloana `sundays.attendance` din D1 rămâne în schemă
    (istoric), dar nu se mai scrie — fail-soft ca `getSchedule` dacă Sheet-ul nu e accesibil.
20. **Șablonul duminicii noi e `src/programTemplate.js`**, copiat după planul standard din
    Planning Center. „Copie după o duminică" copiază rândurile (nu resursele) și mută pe
    predicatorul nou elementele care erau pe numele celui vechi.

21. **Paginile: întâi rețeaua, mereu** (`public/sw.js`). Cât timp e conexiune, service worker-ul
    doar trece cererea mai departe și salvează o copie; copia se arată **numai** când serverul
    nu răspunde (bandă „offline — salvată la HH:MM", din `window.PULS_SAVED_AT` pus de SW).
    Nu schimba asta în cache-first: un program de duminică vechi arătat ca „actual" e mai rău
    decât o pagină care nu se încarcă.
22. **Copiile salvate conțin date personale** → se șterg la `/logout` și la orice navigare pe
    `/login` (sesiune expirată, parolă resetată, alt cont pe același telefon). `/login`, `/logout`,
    `/cont`, `/admin/…` nu se salvează niciodată (`NEVER_SAVE` în `sw.js`) — o rută nouă cu date
    sensibile se adaugă acolo. `/api/…` și `/resurse/…` nu trec deloc prin service worker.
23. **`public/` e servit ÎNAINTEA Worker-ului și fără login** (`[assets]` în `wrangler.toml`) —
    trebuie, fiindcă browserul cere manifestul și iconițele fără cookie. Nu pune acolo nimic
    personal. `html_handling = "none"`: un `.html` din `public/` nu devine rută „frumoasă" care
    să umbrească o rută a Worker-ului.
24. `STATIC_VERSION` din `sw.js` se crește **doar** când se schimbă lista `PRECACHE` (fonturi,
    iconițe, `offline.html`). Șabloanele nu trec prin cache-ul static, deci o schimbare de pagină
    ajunge la toată lumea la următoarea navigare, fără nicio versiune.
25. **Navigarea pe telefon (≤760px) o construiește `initNav`**: bara de jos pe roluri și săgeata
    „înapoi" din bara de sus. Săgeata ia `href`-ul linkului `.back-link` din pagină (care e ascuns
    pe telefon) — o pagină nouă de detaliu trebuie să aibă `<a class="back-link">`. Primul `h1` din
    `.wrap` urcă în bară la derulare.
26. **Fără `alert`/`confirm`/`prompt`** — în aplicația instalată arată străin și blochează pagina.
    Se folosesc `confirmDialog` (butonul sigur primește focusul; `danger: true` pentru ștergeri),
    `promptDialog`, `credentialsDialog` (parole de dat mai departe, cu „Copiază tot").
27. **Graficele SVG se desenează la lățimea reală**: `W = chartWidth(svg, fallback)` + `viewBox`
    setat dinamic + `onWidthChange()` pentru redesenare. Cu `W` fix, pe telefon tot desenul (și
    textul) era micșorat la ~5px.
28. **Stare ținută minte** în `localStorage`, mereu prin `remember()`/`recall()` (prefix `puls-`):
    `theme`, `day-view` (slideshow/toate), `range` (+ `range-from`/`range-to`), `install-hint`.
    Nimic de acolo nu e necesar pentru funcționare — lipsa lui (navigare privată) doar resetează.
29. **Urcarea de fișiere merge prin XHR**, nu prin `api()`/fetch — fetch nu raportează progresul.
    Același endpoint, același corp brut, aceeași verificare de `Origin` pe server.
30. **Fonturile sunt găzduite local**: câte un subset latin (Fontsource) + unul mic doar cu ă/ș/ț
    (`unicode-range`). Pentru o greutate nouă: `npm pack @fontsource-variable/manrope` (etc.),
    apoi `pyftsubset <latin-ext.woff2> --unicodes=U+0102-0103,U+015E-015F,U+0162-0163,U+0218-021B
    --flavor=woff2 --layout-features='*'`. Orice `font-family` nou folosește
    `var(--font-display|--font-body|--font-mono)` — au fonturi de rezervă.

31. **Aplicația Android e un Trusted Web Activity, nu cod separat** (`android/`): deschide site-ul
    live pe tot ecranul. Legată de host-ul `pulsul-duminicii.iarisgabor.workers.dev` și de cheia de
    semnare prin `public/.well-known/assetlinks.json` (pachet `ro.bisericalogos.pulsul` + amprenta
    SHA-256). Dacă lipsește sau nu se potrivește amprenta, aplicația merge, dar cu bara de adrese.
    Cheia (`.jks`) **nu intră niciodată în repo** — stă în secretele de repo
    `PULSUL_ANDROID_KEYSTORE_BASE64` / `PULSUL_ANDROID_KEYSTORE_PASSWORD`; o cheie pierdută = nicio
    actualizare posibilă pe același pachet. Cu Google Play App Signing, amprenta cheii Google se
    ADAUGĂ în assetlinks.json, lângă cea existentă. Detalii: `android/README.md`.
32. **Paginile se pregătesc în fundal (prerender, `<script type="speculationrules" id="spec-rules">`
    din `src/head.html`)**: tab-urile imediat, orice alt link la atingere — de-asta schimbarea de
    pagină e instantă. Prerender-ul CHIAR accesează URL-ul, deci **orice rută GET cu efecte trebuie
    exclusă acolo** (acum: `/logout`; excluse și `/login`, `/api/`, `/resurse/`). După orice
    modificare, `markChanged()` reîncarcă regulile (paginile deja pregătite ar fi vechi) — `api()`
    o face singur pentru POST/PATCH/PUT/DELETE; un apel făcut altfel (ca urcarea prin XHR) trebuie
    s-o cheme explicit.
33. **„Înapoi" instant (bfcache)**: HTML-ul are `cache-control: private, no-cache` (nu `no-store`,
    care oprea bfcache-ul) și `/logout` trimite `Clear-Site-Data: "cache"`. O pagină readusă din
    memorie se reîncarcă singură dacă între timp s-a schimbat utilizatorul sau s-a modificat ceva
    (garda `pageshow` din `shared.txt`). Nu adăuga handlere `unload` — scot pagina din bfcache.
34. **Tranziții cu direcție** (`pagereveal` + `:active-view-transition-type` în `shared.css`): spre o
    pagină mai „adâncă" glisează din dreapta, înapoi spre dreapta, între tab-uri doar estompare.
    Adâncimea vine din `NAV_ROOTS` (`shared.txt`) — o pagină nouă de nivel de tab se adaugă acolo.
35. **Prima imagine a paginii e completă**: `<link rel="expect" href="#randat" blocking="render">`
    (head) ține afișarea până la markerul `#randat`, pus de `render.js` înainte de `</body>`, după
    scripturi. Fiecare șablon trebuie să aibă exact un `</body>`.

36. **Aplicația nativă (`android-nativ/`) primește exact datele paginilor.** Fiecare pagină are un
    `build…Payload()` în `render.js`, folosit și de `render…()` (HTML), și de `src/appApi.js`
    (`GET /api/app` + calea paginii, răspuns `{user, data}`). Deci **o schimbare de payload ajunge
    și în aplicație**: un câmp redenumit sau scos o poate strica — verifică `android-nativ/app/.../data/Models.kt`.
    Un câmp nou e inofensiv (aplicația ignoră ce nu cunoaște). Testul `tests/api-app.mjs` compară
    JSON-ul cu `PAYLOAD`-ul din HTML pe fiecare rută; o pagină nouă se adaugă și acolo.
37. **Tokenul aplicației = același token de sesiune**, citit din `Authorization: Bearer` sau din
    cookie (`readToken` în `session.js`) — aceleași reguli: 30 de zile, `session_gen`, amprenta de
    admin, delogare la resetare. Verificarea de `Origin` rămâne pentru orice scriere: aplicația
    trimite `Origin: <site>`. `/api/app/…` răspunde **403 JSON** unde site-ul redirecționează.
38. **Calculele din browser sunt duplicate în aplicație**: intervalele de pe `/categorii/:cheie`
    (`category.html` → `domain/CategoryRange.kt`) și mini-dashboard-ul zilei (`day.html` →
    `domain/DayStats.kt`). O schimbare de formulă pe site se face și acolo (au teste JUnit).
39. Workflow-ul de deploy **ignoră** `android-nativ/**` (o schimbare doar în aplicație nu redeploy-ează
    Worker-ul); invers, schimbările din `src/` care ating `/api/app` trebuie să ajungă live înainte
    ca un APK pentru producție să le folosească.

## Deploy

Automat, prin GitHub Actions (`.github/workflows/deploy-pulsul-duminicii.yml` la rădăcina
repo-ului): la fiecare push pe `main` care atinge acest folder. `wrangler deploy` urcă și
`public/` (fișierele statice), fără pași în plus. Aplicația Android se construiește separat, în
`.github/workflows/android-pulsul-duminicii.yml` (APK + AAB la „Artifacts") — nu face deploy. Singurul secret e
`CLOUDFLARE_API_TOKEN` în repo. Workflow-ul pune singur `database_id`-ul D1 în
`wrangler.toml` (în copia de pe runner — în repo rămâne placeholder-ul) și scoate binding-ul
R2 dacă R2 nu e activat în cont. Setup complet: `README.md`.

## Comenzi

```bash
npm install
cp .dev.vars.example .dev.vars   # completează cu valori reale sau de test (inclusiv ADMIN_PASSWORD)
npx wrangler d1 migrations apply DB --local
npm run dev
npm test          # ~75s: site local pe stare separată + date sintetice + Chromium — vezi tests/README.md
npx wrangler deploy
npx wrangler tail
```

**Rulează `npm test` înainte de orice push care atinge acest folder.** Suitele (`tests/`) verifică
și permisiunile direct pe API, aspectul pe telefon și modul offline.

## Config și secrete

`[vars]` în `wrangler.toml`: `AUTH_MODE` (`none` | `password` | `access`),
`GOOGLE_SHEET_ID` (`1NIRVF-Dfxbu3BweApf9eWhMW80ZLeXw6RGPAVAQieic` — deținut de
`butmarius@gmail.com`; service account-ul trebuie adăugat Viewer de cineva cu drept de
editare pe el), `PREACHERS_SHEET_ID` (Calendar predicare) și `ATTENDANCE_SHEET_ID`
(Participare parteneri — `1c4L4Bw0z4S2hao9UOb24GkjUwESuzJwQLiHPm95p-bE`), fiecare cu propriul
proprietar și acces Viewer de dat separat. KV: `PULSUL_KV`.

D1: `DB` (baza `pulsul-duminicii`, migrații în `migrations/`). R2: `RESURSE` (bucket
`pulsul-resurse`).

Secrete: `ADMIN_PASSWORD` (opțional, are prioritate peste `ADMIN_PASSWORD_HASH`), `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `SITE_PASSWORD` (doar la `AUTH_MODE = "password"`),
`ANTHROPIC_API_KEY` (opțional).

## Model

`claude-haiku-4-5` în ambele fișiere de AI (`src/aiSummary.js:41`,
`src/aiTrendSummary.js:122`), prin `fetch()` direct — fără SDK, ca peste tot în acest repo.
