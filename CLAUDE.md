# CLAUDE.md — Ghid de orientare în acest repo

> Încărcat automat la fiecare sesiune Claude Code pornită în acest folder. Scopul lui:
> să știi instant unde să te duci, fără să recitești tot repo-ul.

Acest folder conține **opt proiecte reale, fără nicio legătură între ele**, plus
tooling Claude Code și un vault personal de notițe Obsidian suprapus peste tot.
Arhitectura completă a fiecărui proiect e în documente separate (linkate mai jos) —
acest fișier e doar harta.

## Hartă rapidă — "despre ce vorbim?"

| Cuvinte cheie | Unde mergi |
|---|---|
| site-ul, aplicația, calculator de calorii, TDEE/BMR, plan alimentar, nutriție, plan de antrenament, exerciții | **FF Fitness** → §1 + `architecture.md` |
| homepage, pagina principală | `index.html` |
| pagina de plan (după plată) | `plan.html` |
| calculator, i18n/traduceri, rețete, PDF, email plan, fallback offline | `script.js` (toată logica frontend, un singur fișier) |
| catalog exerciții, hartă corporală | `exercises-data.js` |
| stiluri, teme, culori | `styles.css` |
| Termeni / Confidențialitate | `terms.html` / `privacy.html` |
| API, backend, Stripe, plăți, Gmail, rate limiting, cache | `worker/index.js` → §1 + `architecture.md` §2 |
| bot de Telegram, Google Calendar, Planning Center, agendă zilnică | **telegram-assistant/** → §2 + `telegram-assistant/README.md` |
| feedback biserică, Pulsul Duminicii, statistici duminică, slideshow pe categorie, rezumat AI feedback | **pulsul-duminicii/** → §3 + `pulsul-duminicii/README.md` |
| ii cusute de bunica, magazin de ii, scroll-film, broderie | **Ia bunicii mele** → §4 + `ia-bunicii-mele/README.md` |
| ia desenată punct cu punct, silueta cămășii, altiță/încreț/râuri/poale | `ia-bunicii-mele/js/pattern.js` |
| filmul de la scroll, canvas, camera care urmărește acul | `ia-bunicii-mele/js/film.js` |
| coș, plată Stripe în pagină, marcat ia ca vândută | `ia-bunicii-mele/js/cos.js` + `ia-bunicii-mele/supabase/functions/` |
| adăugat/schimbat ii, încărcat poze, cont de admin | `ia-bunicii-mele/admin.html` + `js/admin.js` |
| fișă de meci, pauza muzicală, Blaugrana, FC Barcelona (pagina statică) | **FOTBALL/** → §5 |
| librărie online demo, PRAG, autori, carte, coș (fără backend real) | **libraria-moderna/** → §6 |
| nomenclator librărie, import POS, Bluecash50, PLU, coduri de bare, decenu.eu | **POS NOU/** → §7 |
| agenție AI, site de prezentare Iaris Gabor, servicii AI | **ai-agency/** → §8 |
| skill-uri Claude Code, afaceri locale RO, eMag, prețuri cărți, generare site-uri, scroll-film | `.claude/skills/` → §9 |
| agentul de scor FC Barcelona | `.claude/agents/Show-score.md` |
| notițe personale, vault | e Obsidian, nu cod → §10 |
| fișier gol/orfan/necunoscut găsit prin repo | probabil în §10 — verifică acolo înainte să presupui că e activ |

## 1. FF Fitness — aplicația principală (rădăcina repo + `worker/`)

Site static RO/EN, fără framework/build step: calculator TDEE/BMR gratuit, plan
alimentar AI de 7 zile taxat $5 (Stripe) cu rețete + export PDF + email, plan de
antrenament AI gratuit.

**Arhitectură completă (fluxuri, cache, rate limiting, deployment, diagramă):
`architecture.md`. Citește-l înainte de orice schimbare care atinge Worker-ul sau
fluxul de plată.**

Fișiere:
- `index.html` — homepage / SPA (calculator, exerciții, FAQ)
- `plan.html` — pagina planului alimentar, doar după plată
- `script.js` — toată logica frontend, ambele pagini
- `exercises-data.js` — catalogul static de exerciții
- `styles.css` — stiluri
- `terms.html`, `privacy.html`
- `worker/index.js` — tot backend-ul (rute API, Stripe, Gmail, Anthropic, cache/rate-limit)
- `worker/wrangler.toml` — config Worker (`name = ff-fitness-nutrition`)

Deploy: frontend static pe **Vercel**; backend pe **Cloudflare Workers**
(`ff-fitness-nutrition.iarisgabor.workers.dev`). Secrete doar ca Wrangler secrets
(`worker/.dev.vars` local, gitignored).

## 2. `telegram-assistant/` — bot personal de Telegram

Bot pe Cloudflare Workers (Agents SDK, Durable Object cu SQLite) care înțelege
limbaj natural în română și acționează pe Google Calendar și Planning Center
Services, plus agendă zilnică automată. Cont unic, blocat pe `ALLOWED_TELEGRAM_USER_ID`.

**Setup, secrete, OAuth, deploy, testare: `telegram-assistant/README.md`.**

Fișiere:
- `src/index.js` — entry point Worker (rute + webhook Telegram)
- `src/agent.js` — `AssistantAgent` (Durable Object): istoric SQL, bucla de tool-use, agendă
- `src/anthropic.js` — apel Claude direct prin `fetch` (fără SDK, cu prompt caching)
- `src/prompt.js` — system prompt (română)
- `src/telegram.js` — API Telegram + verificare webhook secret/user
- `src/datetime.js` — helpers dată/oră, aware de ora de vară/iarnă
- `src/agenda.js` — formatare agendă zilnică
- `src/tools/calendar.js` — CRUD Google Calendar
- `src/tools/planning-center.js` — Planning Center Services/People

**Stare: netracked de git (nu a fost încă commis) — lucru în desfășurare.** Complet
separat de FF Fitness — singura suprapunere e că OAuth-ul de Gmail din `worker/` a
fost model pentru cel de Google Calendar de aici.

## 3. `pulsul-duminicii/` — statistici live pentru feedback-ul de duminică

Site live (Cloudflare Worker, un singur fișier de intrare + câteva module mici),
fără frontend separat, care citește la fiecare vizită Google Sheet-ul din spatele
formularului „Evaluare întâlnire duminică" și randează un raport în stilul
`librarie/pulsul-duminicii.html` (design-ul original, făcut manual o singură dată).
Adaugă un slideshow pe categorie (Închinare, Rugăciune, Predică etc.) pentru
duminica aleasă — gândit pentru întâlnirea de feedback de luni a echipei — și un
rezumat opțional generat de Claude peste răspunsurile deschise ale zilei.

**Setup (service account Google, secrete, deploy, testare): `pulsul-duminicii/README.md`.**

Fișiere:
- `src/index.js` — entry point Worker (`fetch`/`scheduled`), rutare `/`, `/zile`, `/zile/:slug`, `/categorii`, `/categorii/:key`
- `src/auth.js` — poarta de acces, comutabilă din `wrangler.toml` (`AUTH_MODE`)
- `src/sheets.js` — auth Google prin service account (JWT semnat cu `crypto.subtle`, fără OAuth interactiv) + citire Sheets API
- `src/config.js` — maparea coloană-Sheet → categorie (singurul loc de ajustat dacă se schimbă formularul)
- `src/transform.js` — rânduri brute → `DATA`/`RESPONSES` + toate agregatele, inclusiv `categoryWeeklySeries` (serie săptămânală per categorie, pentru pagina de analiză)
- `src/aiSummary.js` — rezumat opțional per duminică (Claude Haiku 4.5), cache KV pe hash de conținut
- `src/aiTrendSummary.js` — analiză AI opțională a tendinței per categorie (Claude Haiku 4.5), doar pentru presetup-urile de interval de pe `/categorii/:cheie` (1/3/6/12 luni, Tot), cache KV
- `src/render.js` — orchestrează fetch→transform→randare, cu fallback din cache la eroare
- `src/shared.css`, `src/shared.txt` — stiluri și JS comune tuturor paginilor (temă, meniu, tooltip)
- `src/home.html` — pagina Acasă (statistici generale)
- `src/days.html`, `src/day.html` — lista de duminici și pagina unei duminici (slideshow/dashboard pe categorie)
- `src/categories.html`, `src/category.html` — analiză pe categorie în timp, cu interval selectabil (1/3/6/12 luni, tot, sau custom)

Live la fiecare vizită, fără cron — „automatizarea" cerută (update lunea) e implicită.
Link neafișat public, fără parolă (`AUTH_MODE = "none"`) — conținutul include uneori
nume și reflecții personale ale membrilor, deci linkul nu se distribuie public.

## 4. `ia-bunicii-mele/` — magazin online de ii cusute de mână

Site static (fără framework, fără build step) cu backend pe Supabase. Pagina principală
e un **film derulat la scroll**: un singur cadru continuu în care camera stă pe pânză și
urmărește acul cum coase o ie, registru cu registru, până se vede cămașa întreagă.
Nu există nicio imagine în film — silueta și fiecare punct de cruce sunt generate din cod.

**Live: https://ia-bunicii-mele.vercel.app** · admin: `/admin.html`
**Setup complet (Supabase, Stripe, ce mai e de completat): `ia-bunicii-mele/README.md`.**

Fișiere:
- `index.html` — filmul + povestea + cum se face + iile + întrebări
- `magazin.html` — toate iile; `admin.html` — login + adăugat/schimbat ii (noindex)
- `js/pattern.js` — **generatorul iei**: silueta cămășii și toate punctele, în ordinea
  în care s-ar coase (altița → încrețul → râurile → pieptul → poalele → tivul)
- `js/film.js` — canvas-ul filmului: camera care urmărește acul, țesătura, acul și firul
- `js/site.js` — antet, titlul literă cu literă, apariții la scroll, cifre
- `js/shop.js` — citește iile din Supabase; fără poză, generează un motiv cusut din nume
- `js/cos.js` — coșul (localStorage) + fereastra Stripe montată în panou
- `js/admin.js` — CRUD ii, încărcat poze (micșorate în browser înainte de urcare)
- `css/site.css` (lumea vizuală, toate paginile) · `css/film.css` (scena filmului)
- `supabase/migrations/` — schema; **fiecare tabel are RLS pornit și politicile scrise
  în aceeași migrare cu el**
- `supabase/functions/checkout` — deschide plata; **prețurile se citesc din bază, nu din
  ce trimite browserul** (clientul trimite doar id-uri)
- `supabase/functions/stripe-webhook` — singurul loc care marchează o ie ca vândută,
  după ce verifică semnătura Stripe

Deploy: frontend pe **Vercel** (`vercel deploy --prod` din folder; `supabase/` e exclus
prin `.vercelignore`, fiindcă migrările conțin emailul de admin). Backend pe **Supabase**
(proiect `ggeyhtaggxggjuifpumh`, eu-central-1). Nu există tabel de comenzi — evidența,
adresele și bonurile stau în Stripe.

**Filmul nu folosește Lenis, intenționat:** scrub-ul e legat direct de scroll, un singur
strat de netezire. Verificare: `?jump=<pixeli>` + `window.__ready`, cu
`.claude/skills/scroll-film-studio/scripts/verify.js` (capturi + test de fluiditate).

## 5. `FOTBALL/` — pagină statică de fișă de meci FC Barcelona

Trei fișiere, fără backend, fără build step: `index.html` + `script.js` (76 linii) +
`styles.css`. Fără legătură cu agentul `Show-score` din §9 — acela răspunde live prin
WebSearch, asta e o pagină statică ("Blaugrana — fișa de meci & pauza muzicală").

## 6. `libraria-moderna/` — demo de magazin online de cărți ("PRAG")

Site static (fără framework, fără build step), date fictive hardcodate în
`js/data.js` — **nu e conectat la niciun backend real**, nu confunda cu `librarie/`
(design de referință pentru §3 pulsul-duminicii) sau `librarie-test/`.

Fișiere:
- `index.html`, `magazin.html`, `carte.html`, `autori.html`, `despre.html`, `contact.html`, `cos.html`
- `js/data.js` — categorii, autori, cărți (placeholder)
- `js/catalog.js`, `js/cart.js`, `js/main.js`
- `css/styles.css`

## 7. `POS NOU/` — nomenclator librărie → import Bluecash50 (POS)

Nu e o aplicație — e un folder de lucru pentru curățarea unui nomenclator de
bibliotecă/librărie (776 → 685 articole, doar cărți) și generarea fișierului de
import PLU pentru un terminal fiscal **Datecs BlueCash 50**.

**Detalii complete (format PLU, convenții TVA/grupă/departament, ce s-a curățat):
`POS NOU/CLAUDE.md`.**

Fișiere: `Nomenclator (2).xlsx` (sursă brută, nu se modifică), `Nomenclator (2) -
curatat.xlsx` (sursa de adevăr), `plu_import.csv` (fișierul final de import),
`plu.csv` (exemplu de format primit), `imagini_decenu/` (63 coperte JPEG pentru
editura decenu.eu). `Book1.ods` și `Import BuCon.ods` sunt istoric, deprecated.

## 8. `ai-agency/` — site de prezentare, agenție AI (Iaris Gabor)

**Repo git separat, cu propriul remote GitHub (`iarisgabor/ai-agency`) — nu face
parte din monorepo-ul acesta.** Ținut aici doar ca folder pe disc, ignorat explicit
din `.gitignore` ca să nu apară ca gitlink/submodul spart. Orice commit la acest
proiect se face din `ai-agency/` cu propriul `git`, separat de restul.

Stack: Vite + React, deploy pe Vercel (`.vercel/project.json` prezent).

## 9. `.claude/` — tooling Claude Code (agent + skill-uri), separat de toate aplicațiile

- Agent `Show-score` — scor FC Barcelona (Haiku 4.5 + WebSearch)
- Skill `afaceri-locale-ro` — director de afaceri RO din OpenStreetMap → CSV
- Skill `website-afaceri-ro` — generează site de-o-pagină pentru o afacere locală
- Skill `emag-cauta` — compară produse pe eMag.ro după preț/recenzii
- Skill `pret-carte-ro` — caută prețul unei cărți în librăriile RO
- Skill `skill-builder` — construiește/verifică alte skill-uri Claude Code
- Skill `scroll-film-studio` — site-uri cu film derulat la scroll (a construit §4)

Flux tipic: `afaceri-locale-ro` → CSV → `website-afaceri-ro` → HTML în `rezultate/`.

## 10. Nu sunt proiecte active — ignoră dacă nu ești rugat explicit de ele

- `api/` — folder gol, rămășiță de dinainte de migrarea backend-ului la Cloudflare Worker.
- `player.gd` — script Godot orfan (gitignored), fără legătură cu nimic din acest repo.
- `test/index.html` — pagină demo generată de skill-ul `website-afaceri-ro` (clinică
  dentară fictivă, Oradea) — nu un test al FF Fitness.
- `.obsidian/` — acest folder e deschis și ca vault Obsidian pentru notițe personale.
  Config, nu cod.

## Convenții

- Mesajele de commit și documentația (`architecture.md`, README-uri) sunt în română.
- Fiecare proiect cu Worker (`worker/`, `telegram-assistant/`, `pulsul-duminicii/`) ține
  secretele în `.dev.vars` local (gitignored) + Wrangler secrets pe Cloudflare —
  niciodată în fișiere commise.
- `ia-bunicii-mele/` ține secretele ca Supabase secrets (Stripe) — în repo stă doar
  `config.js`, cu adresa proiectului și cheia publishable, publice prin design.
  Zidul e RLS, nu secretul cheii.
