# CLAUDE.md — Ghid de orientare în acest repo

> Încărcat automat la fiecare sesiune Claude Code pornită în acest folder. Scopul lui:
> să știi instant unde să te duci, fără să recitești tot repo-ul.

Acest folder conține **treisprezece proiecte reale, fără nicio legătură directă între ele**,
organizate în două categorii — `personal/` și `profesional/` — plus tooling Claude
Code și un vault personal de notițe Obsidian suprapuse peste tot, la rădăcină.
Arhitectura completă a fiecărui proiect e în documente separate (linkate mai jos) —
acest fișier e doar harta.

**Fiecare proiect are propriul `CLAUDE.md`**, în folderul lui: harta de fișiere, ancore
de cod, comenzi, secrete și — cel mai important — regulile care nu se văd din cod
(invarianți de securitate, decizii deliberate, capcane). Se încarcă automat când
lucrezi în folderul respectiv. **Citește-l înainte să modifici ceva în acel proiect**;
fișierul de față îți spune doar în ce folder să intri.

**Notă de migrare (rezolvată):** toate proiectele au fost mutate din rădăcina
repo-ului în `personal/` sau `profesional/`. FF Fitness era la rădăcină (nu
într-un subfolder) — proiectul Vercel `ff-fitness-nutrition` are Root Directory
setat acum la `personal/ff-fitness` (schimbat prin `vercel project update
ff-fitness-nutrition --root-directory personal/ff-fitness`), commit-urile au fost
împinse pe `origin/main`, iar Vercel a redeployat automat prin integrarea Git.
Verificat live: homepage + `assets/logo.png` răspund cu HTTP 200 pe
https://ff-fitness-nutrition.vercel.app.

## Hartă rapidă — "despre ce vorbim?"

| Cuvinte cheie | Unde mergi |
|---|---|
| site-ul, aplicația, calculator de calorii, TDEE/BMR, plan alimentar, nutriție, plan de antrenament, exerciții | **FF Fitness** → §1 + `personal/ff-fitness/architecture.md` |
| homepage, pagina principală | `personal/ff-fitness/index.html` |
| pagina de plan (după plată) | `personal/ff-fitness/plan.html` |
| calculator, i18n/traduceri, rețete, PDF, email plan, fallback offline | `personal/ff-fitness/script.js` (toată logica frontend, un singur fișier) |
| catalog exerciții, hartă corporală | `personal/ff-fitness/exercises-data.js` |
| stiluri, teme, culori (FF Fitness) | `personal/ff-fitness/styles.css` |
| Termeni / Confidențialitate (FF Fitness) | `personal/ff-fitness/terms.html` / `privacy.html` |
| API, backend, Stripe, plăți, Gmail, rate limiting, cache | `personal/ff-fitness/worker/index.js` → §1 + `architecture.md` §2 |
| bot de Telegram, Google Calendar, Planning Center, agendă zilnică | **personal/telegram-assistant/** → §2 + `README.md` |
| feedback biserică, Pulsul Duminicii, statistici duminică, slideshow pe categorie, rezumat AI feedback | **personal/pulsul-duminicii/** → §3 + `README.md` |
| ii cusute de bunica, magazin de ii, scroll-film, broderie | **personal/ia-bunicii-mele/** → §4 + `README.md` |
| ia desenată punct cu punct, silueta cămășii, altiță/încreț/râuri/poale | `personal/ia-bunicii-mele/js/pattern.js` |
| filmul de la scroll, canvas, camera care urmărește acul | `personal/ia-bunicii-mele/js/film.js` |
| coș, plată Stripe în pagină, marcat ia ca vândută | `personal/ia-bunicii-mele/js/cos.js` + `supabase/functions/` |
| adăugat/schimbat ii, încărcat poze, cont de admin | `personal/ia-bunicii-mele/admin.html` + `js/admin.js` |
| fișă de meci, pauza muzicală, Blaugrana, FC Barcelona (pagina statică) | **personal/FOTBALL/** → §5 |
| librărie online demo, PRAG, autori, carte, coș (fără backend real) | **personal/libraria-moderna/** → §6 |
| agenție AI, site de prezentare Iaris Gabor, servicii AI | **personal/ai-agency/** → §7 |
| avize librărie, calcul preț de vânzare cărți, room22-replica | **personal/librarie/** → §8 |
| chat AI recomandare cărți, widget librărie, "Filă cu Filă" | **personal/librarie-test/** → §9 |
| primul client, playbook, outreach, nișă, mesaj de cold outreach, abonament lunar, checklist clienți | **personal/primul-client/** → §10 |
| nomenclator librărie, import POS, Bluecash50, PLU, coduri de bare, decenu.eu | **profesional/POS NOU/** → §11 |
| site instalații, instalator, Doctor Kumy Instal, sanitare/termice/electrice/climatizare/centrale, ANRE, ISCIR | **profesional/instalatii/** → §12 |
| portofoliu fotograf, Petra Butincu, beauty, fashion editorial, campanii de produs, Lumedics, Splendor | **profesional/petra-butincu-portofoliu/** → §13 |
| CAMERA OBSCURĂ, film Petra Butincu, hero cu autoplay, footage generat, storyboard | **profesional/petra-butincu-film/** → §13 (al doilea site, separat) |
| portofoliu Petra Studio Alb, fundal ivoire, beauty+produs, fără temă închisă | **profesional/petra/** → §13 (a treia variantă, separată) |
| skill-uri Claude Code, afaceri locale RO, eMag, prețuri cărți, generare site-uri, scroll-film | `.claude/skills/` → §14 |
| agentul de scor FC Barcelona | `.claude/agents/Show-score.md` |
| notițe personale, vault | e Obsidian, nu cod → §15 |
| fișier gol/orfan/necunoscut găsit prin repo | probabil în §15 — verifică acolo înainte să presupui că e activ |

## Ghidul fiecărui proiect

| § | Proiect | Ghid propriu | Documentație suplimentară |
|---|---|---|---|
| 1 | FF Fitness | `personal/ff-fitness/CLAUDE.md` | `architecture.md` (fluxuri, cache, plată) |
| 2 | telegram-assistant | `personal/telegram-assistant/CLAUDE.md` | `README.md` (OAuth, secrete, webhook) |
| 3 | pulsul-duminicii | `personal/pulsul-duminicii/CLAUDE.md` | `README.md` (service account, deploy) |
| 4 | ia-bunicii-mele | `personal/ia-bunicii-mele/CLAUDE.md` | `README.md` (Supabase/Stripe de completat) |
| 5 | FOTBALL | `personal/FOTBALL/CLAUDE.md` | — |
| 6 | libraria-moderna | `personal/libraria-moderna/CLAUDE.md` | — |
| 7 | ai-agency | `personal/ai-agency/CLAUDE.md` | *(în repo-ul lui, nu în acesta)* |
| 8 | librarie | `personal/librarie/CLAUDE.md` | — |
| 9 | librarie-test | `personal/librarie-test/CLAUDE.md` | `README.md` (rulare, deploy) |
| 10 | primul-client | `personal/primul-client/CLAUDE.md` | — |
| 11 | POS NOU | `profesional/POS NOU/CLAUDE.md` | — |
| 12 | instalatii | `profesional/instalatii/CLAUDE.md` | — |
| 13 | petra-butincu-portofoliu | `profesional/petra-butincu-portofoliu/CLAUDE.md` | `.tmp/grill-me/portofoliu-fotograf.md` (cele 24 de decizii de design) |
| 13 | petra-butincu-film (CAMERA OBSCURĂ) | `profesional/petra-butincu-film/CLAUDE.md` | `docs/storyboard.md` (storyboard, prompturi de motor, paletă, buget) |
| 13 | petra (Studio Alb) | `profesional/petra/CLAUDE.md` | — |

## Personal (`personal/`)

### 1. `personal/ff-fitness/` — aplicația principală

Site static RO/EN, fără framework/build step: calculator TDEE/BMR gratuit, plan
alimentar AI de 7 zile taxat $5 (Stripe) cu rețete + export PDF + email, plan de
antrenament AI gratuit.

**Arhitectură completă (fluxuri, cache, rate limiting, deployment, diagramă):
`personal/ff-fitness/architecture.md`. Citește-l înainte de orice schimbare care
atinge Worker-ul sau fluxul de plată.**

Fișiere:
- `index.html` — homepage / SPA (calculator, exerciții, FAQ)
- `plan.html` — pagina planului alimentar, doar după plată
- `script.js` — toată logica frontend, ambele pagini
- `exercises-data.js` — catalogul static de exerciții
- `styles.css` — stiluri
- `assets/` — logo, fonturi, iconițe magazine (referențiate relativ din HTML)
- `terms.html`, `privacy.html`
- `worker/index.js` — tot backend-ul (rute API, Stripe, Gmail, Anthropic, cache/rate-limit)
- `worker/wrangler.toml` — config Worker (`name = ff-fitness-nutrition`)

Deploy: frontend static pe **Vercel** (proiect `ff-fitness-nutrition`, Root
Directory = `personal/ff-fitness`, deploy automat la push pe `origin/main` prin
integrarea Git); backend pe **Cloudflare Workers**
(`ff-fitness-nutrition.iarisgabor.workers.dev`). Secrete doar ca Wrangler secrets
(`worker/.dev.vars` local, gitignored). Local mai există și `.vercel/` +
`.env.local` (create de `vercel link`, gitignorate global din `.gitignore`) și un
`.gitignore` propriu în acest folder (`.vercel`, `.env*`) — redundant cu regulile
de la rădăcină, dar inofensiv.

### 2. `personal/telegram-assistant/` — bot personal de Telegram

Bot pe Cloudflare Workers (Agents SDK, Durable Object cu SQLite) care înțelege
limbaj natural în română și acționează pe Google Calendar și Planning Center
Services, plus agendă zilnică automată. Cont unic, blocat pe `ALLOWED_TELEGRAM_USER_ID`.

**Setup, secrete, OAuth, deploy, testare: `README.md` din acest folder.**

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

**Stare: commis o dată cu reorganizarea în `personal/` (`e8987ca`)** — lucru în
desfășurare, mai are `console.log`-uri de debug de scos. Complet separat de FF Fitness —
singura suprapunere e că OAuth-ul de Gmail din `personal/ff-fitness/worker/` a fost model
pentru cel de Google Calendar de aici.

### 3. `personal/pulsul-duminicii/` — statistici live pentru feedback-ul de duminică

Site live (Cloudflare Worker, un singur fișier de intrare + câteva module mici),
fără frontend separat, care citește la fiecare vizită Google Sheet-ul din spatele
formularului „Evaluare întâlnire duminică" și randează un raport în stilul
`../librarie/pulsul-duminicii.html` (design-ul original, făcut manual o singură
dată, acum în §8). Adaugă un slideshow pe categorie (Închinare, Rugăciune, Predică
etc.) pentru duminica aleasă — gândit pentru întâlnirea de feedback de luni a
echipei — și un rezumat opțional generat de Claude peste răspunsurile deschise ale
zilei.

**Setup (service account Google, secrete, deploy, testare): `README.md` din acest folder.**

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

### 4. `personal/ia-bunicii-mele/` — magazin online de ii cusute de mână

Site static (fără framework, fără build step) cu backend pe Supabase. Pagina principală
e un **film derulat la scroll**: un singur cadru continuu în care camera stă pe pânză și
urmărește acul cum coase o ie, registru cu registru, până se vede cămașa întreagă.
Nu există nicio imagine în film — silueta și fiecare punct de cruce sunt generate din cod.

**Live: https://ia-bunicii-mele.vercel.app** · admin: `/admin.html`
**Setup complet (Supabase, Stripe, ce mai e de completat): `README.md` din acest folder.**

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

### 5. `personal/FOTBALL/` — pagină statică de fișă de meci FC Barcelona

Trei fișiere, fără backend, fără build step: `index.html` + `script.js` (76 linii) +
`styles.css`. Fără legătură cu agentul `Show-score` din §14 — acela răspunde live prin
WebSearch, asta e o pagină statică ("Blaugrana — fișa de meci & pauza muzicală").

### 6. `personal/libraria-moderna/` — demo de magazin online de cărți ("PRAG")

Site static (fără framework, fără build step), date fictive hardcodate în
`js/data.js` — **nu e conectat la niciun backend real**, nu confunda cu
`personal/librarie/` (§8) sau `personal/librarie-test/` (§9).

Fișiere:
- `index.html`, `magazin.html`, `carte.html`, `autori.html`, `despre.html`, `contact.html`, `cos.html`
- `js/data.js` — categorii, autori, cărți (placeholder)
- `js/catalog.js`, `js/cart.js`, `js/main.js`
- `css/styles.css`

### 7. `personal/ai-agency/` — site de prezentare, agenție AI (Iaris Gabor)

**Repo git separat, cu propriul remote GitHub (`iarisgabor/ai-agency`) — nu face
parte din monorepo-ul acesta.** Ținut aici doar ca folder pe disc, ignorat explicit
din `.gitignore` (`personal/ai-agency/`) ca să nu apară ca gitlink/submodul spart.
Orice commit la acest proiect se face din `personal/ai-agency/` cu propriul `git`,
separat de restul.

Stack: Vite + React, deploy pe Vercel (`.vercel/project.json` prezent).

### 8. `personal/librarie/` — documente reale de librărie + referință de design

Nu e o aplicație — e un folder de documente și o replică de site:
- `Avize.pdf`, `Calcul pret de vanzare carti.xlsx` (+ backup) — documente reale de
  business ale librăriei (avize, calcul de preț)
- `pulsul-duminicii.html` — designul original făcut manual, folosit ca referință
  pentru §3 `personal/pulsul-duminicii/`
- `Evaluare intalnire duminica (nou) (răspunsuri)...pdf` — export al formularului
  care alimentează §3
- `room22-replica/` — replică statică (index.html + script.js + styles.css + assets)

### 9. `personal/librarie-test/` — "Filă cu Filă", site de test cu chat AI pentru librărie

Site static (fără build step) cu catalog de cărți și un widget de chat AI care
recomandă 1-3 cărți din catalog. Continuare/experiment legat de aceeași librărie ca
§8, dar aplicație de sine stătătoare cu Worker propriu.

**Detalii (rulare locală, deploy, sincronizare catalog): `README.md` din acest folder.**

Fișiere:
- `index.html`, `styles.css`, `script.js` — frontend (catalog + widget de chat)
- `worker/` — Worker Cloudflare, endpoint `POST /api/chat` (Claude + `json_schema` de output)
- `worker/catalog.js` — catalogul folosit de AI, **trebuie sincronizat manual** cu
  `CATALOG` din `script.js` (id-uri identice, altfel widget-ul nu poate evidenția
  cartea recomandată)

### 10. `personal/primul-client/` — playbook-ul primului client, bifabil

Site static de o pagină (fără framework, fără build step, fără backend): flow-ul complet
până la primul client plătitor, în 6 faze și 20 de pași bifabili — alegi nișa,
construiești gratis un site pentru firmă, trimiți mesajul de outreach, transformi
relația în abonament lunar, strângi dovada, repeți. Conținutul e transcris dintr-un
[playbook Notion](https://satin-wolverine-1aa.notion.site/Playbook-ul-Primului-Client-3cfe4efbe5f58148a557d5b0c3b7761d)
(link în subsol) — e material de business, nu cod de referință.

Fișiere:
- `index.html` — schelet (antet cu progres, hero, câmpurile „Ale mele", nav, obiective, subsol)
- `js/data.js` — **tot conținutul playbook-ului**: `FAZE` (pași, subbife, note, liste),
  `TEMPLATE_MESAJE` (3 variante de cold outreach), `SERVICII` (tabelul de abonamente),
  `OBIECTIVE`, `STATUSURI_FIRMA`. Aici se editează textul, nu în HTML.
- `js/app.js` — randare + stare (bife, tracker de firme, temă)
- `css/styles.css` — temă deschisă implicit, temă închisă după sistem sau după butonul ◐

Reguli:
- **Id-urile pașilor din `data.js` sunt cheia progresului salvat.** Dacă redenumești un
  `id`, utilizatorul pierde bifa pe pasul acela — adaugă pași noi cu id-uri noi, nu
  refolosi și nu renumerota id-uri existente.
- Toată starea stă în `localStorage`, cheia `primul-client.v1` (bife, firmele din tracker,
  nișa/orașul/numele, tema). Nu există backend și nu pleacă nimic din browser. Dacă
  schimbi forma stării incompatibil, urcă versiunea din cheie.
- Bifarea unui pas bifează toate subbifele lui; bifarea ultimei subbife bifează pasul.
- Câmpurile „Ale mele" (nișă, oraș, nume) se injectează în template-urile de mesaje prin
  `personalizeaza()` — dacă adaugi un placeholder nou în `TEMPLATE_MESAJE`, adaugă-i și
  regula de înlocuire acolo.

## Profesional (`profesional/`)

### 11. `profesional/POS NOU/` — nomenclator librărie → import Bluecash50 (POS)

Nu e o aplicație — e un folder de lucru pentru curățarea unui nomenclator de
bibliotecă/librărie (776 → 685 articole, doar cărți) și generarea fișierului de
import PLU pentru un terminal fiscal **Datecs BlueCash 50**.

**Detalii complete (format PLU, convenții TVA/grupă/departament, ce s-a curățat):
`profesional/POS NOU/CLAUDE.md`.**

Fișiere: `Nomenclator (2).xlsx` (sursă brută, nu se modifică), `Nomenclator (2) -
curatat.xlsx` (sursa de adevăr), `plu_import.csv` (fișierul final de import),
`plu.csv` (exemplu de format primit), `imagini_decenu/` (63 coperte JPEG pentru
editura decenu.eu). `Book1.ods` și `Import BuCon.ods` sunt istoric, deprecated.

### 12. `profesional/instalatii/` — site de prezentare, Doctor Kumy Instal SRL

Site static de o pagină (fără framework, fără build step, fără backend) pentru
**Doctor Kumy Instal S.R.L.** (Oradea, CUI RO22177152): instalații sanitare, termice,
electrice, climatizare, centrale termice. Identitatea și contactul firmei sunt date
reale, preluate prin scraping din surse publice (ONRC/Termene.ro, Confidas, Cylex) —
rămân `[COMPLETEAZĂ...]` doar câmpurile fără sursă publică de încredere (email, program,
autorizații ANRE/ISCIR). Fără formular de contact, intenționat: doar `tel:`,
WhatsApp (`wa.me`) și `mailto:`.

**Detalii complete (regulile de sincronizare config↔HTML, contrastele WCAG calculate,
checklist de lansare): `profesional/instalatii/CLAUDE.md`.**

Fișiere: `index.html` (cele 15 secțiuni + SVG-uri inline + JSON-LD `LocalBusiness`),
`js/config.js` (singurul loc cu datele firmei — alimentează doar `href`-uri, nu text
vizibil), `js/main.js`, `css/styles.css` (Inter auto-hostuit, 2 subseturi de diacritice),
`privacy.html`, `terms.html`, `favicon.svg`, `robots.txt`, `sitemap.xml`, `vercel.json`.

### 13. Petra Butincu — **trei site-uri diferite, pentru aceeași persoană**

Petra Butincu, fotografă din Oradea: beauty, fashion editorial și campanii de produs
cosmetic (clienți vizibili în cadre: Lumedics, Splendor Professional). **Primul client
extern real din repo** — nu demo, nu șablon.

Există **trei abordări construite separat, în foldere diferite**, care nu împart
niciun fișier și nu știu una de alta — a treia (`profesional/petra/`) a fost pornită
tocmai fiindcă decizia dintre primele două nu s-a tranșat niciodată (vezi bifa
nebifată din CLAUDE.md-ul site-ului cu film). Nu le amesteca; întreabă care e varianta
pe care o duce mai departe clienta înainte să investești în vreuna.

| Folder | Ce e |
|---|---|
| `profesional/petra-butincu-portofoliu/` | Portofoliul clasic, descris mai jos. React + Vite, temă închisă. |
| `profesional/petra-butincu-film/` | **„CAMERA OBSCURĂ"** — site static, fără build step, cu footage generat (Higgsfield). Titlul + o cutie cu film redă singur, în buclă (`<video autoplay loop>`, `site/film.mp4`); restul paginii se derulează normal. **Nu mai e scroll-film** — a fost convertit din varianta originală full-bleed scrubată la scroll, la cererea utilizatorului (vezi „Istoric" din CLAUDE.md-ul lui). `site/frames/` (cadrele vechiului motor de canvas) rămân doar ca istoric, ignorate din git — regenerabile din `site/film.mp4`. |
| `profesional/petra/` | **"Studio Alb"** — static, fără build step, GSAP+Lenis vendorizate local. Fundal ivoire cald, tipografie serif uriașă, deliberat opusul temelor închise ale celorlalte două. **Live (noindex): https://petra-zeta.vercel.app**. Detalii: `profesional/petra/CLAUDE.md`. |

#### `profesional/petra-butincu-portofoliu/` — portofoliul clasic

Singurul proiect din repo cu build step în afară de `personal/ai-agency`:
**React + Vite + TypeScript + Tailwind + GSAP + Framer Motion**. Fără `hls.js` și fără
`react-router-dom` — fundalul hero e generat prin cod (crossfade Ken Burns peste
fotografii + grain + vignetă), nu e video, iar pagina e una singură.

**Stare: NELANSAT.** `noindex` + `robots.txt Disallow`, cu placeholdere marcate vizibil
prin `CONFIG.inConstructie`. Mai lipsesc: portretul Petrei, textul „Despre", testimoniale
reale, trei cifre reale, și confirmarea linkului de Instagram (dedus din email, neverificat).

**Toate regulile care nu se văd din cod — și cele 24 de decizii de design cu motivele
lor — sunt în `profesional/petra-butincu-portofoliu/CLAUDE.md` și în
`.tmp/grill-me/portofoliu-fotograf.md`. Citește-le înainte să schimbi ceva de design.**

Fișiere: `src/config.ts` (singura sursă pentru nume/contact/Instagram), `src/data/`
(proiecte + testimoniale), `src/components/` (o componentă per secțiune),
`scripts/build-images.mjs` (originale → WebP, `npm run poze`), `poze-fotograf/`
(originalele, **gitignorate** — se comit doar derivatele din `src/assets/foto/`).

## 14. `.claude/` — tooling Claude Code (agent + skill-uri), separat de toate aplicațiile

- Agent `Show-score` — scor FC Barcelona (Haiku 4.5 + WebSearch)
- Skill `afaceri-locale-ro` — director de afaceri RO din OpenStreetMap → CSV
- Skill `website-afaceri-ro` — generează site de-o-pagină pentru o afacere locală
- Skill `emag-cauta` — compară produse pe eMag.ro după preț/recenzii
- Skill `pret-carte-ro` — caută prețul unei cărți în librăriile RO
- Skill `skill-builder` — construiește/verifică alte skill-uri Claude Code
- Skill `scroll-film-studio` — site-uri cu film derulat la scroll (a construit §4)

Flux tipic: `afaceri-locale-ro` → CSV → `website-afaceri-ro` → HTML în `rezultate/`.

## 15. Nu sunt proiecte active — ignoră dacă nu ești rugat explicit de ele

- `api/` — folder gol, rămășiță de dinainte de migrarea backend-ului la Cloudflare Worker.
- `player.gd` — script Godot orfan (gitignored), fără legătură cu nimic din acest repo.
- `test/index.html` — pagină demo generată de skill-ul `website-afaceri-ro` (clinică
  dentară fictivă, Oradea) — nu un test al FF Fitness.
- `.obsidian/` — acest folder e deschis și ca vault Obsidian pentru notițe personale.
  Config, nu cod.
- `profesional/petra-butincu/` — folder gol, orfan (fără fișiere, doar directorul).
  Nu face parte din niciunul din cele trei proiecte Petra Butincu (§13) — nu-l
  confunda cu `profesional/petra-butincu-film/` sau `profesional/petra/`.

## Convenții

- Mesajele de commit și documentația (`architecture.md`, README-uri) sunt în română.
- Structura de foldere e pe categorie de business: `personal/` vs `profesional/` —
  la adăugarea unui proiect nou, întreabă în care din cele două intră înainte să-l
  plasezi.
- Fiecare proiect cu Worker (`personal/ff-fitness/worker/`,
  `personal/telegram-assistant/`, `personal/pulsul-duminicii/`,
  `personal/librarie-test/worker/`) ține secretele în `.dev.vars` local (gitignored)
  + Wrangler secrets pe Cloudflare — niciodată în fișiere commise.
- `personal/ia-bunicii-mele/` ține secretele ca Supabase secrets (Stripe) — în repo
  stă doar `config.js`, cu adresa proiectului și cheia publishable, publice prin
  design. Zidul e RLS, nu secretul cheii.
- `personal/ai-agency/` e repo git independent (remote GitHub propriu) — ignorat
  din acest monorepo, nu se comite niciodată de aici.
