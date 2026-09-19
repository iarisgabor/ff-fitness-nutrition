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
| bot de Telegram, Google Calendar, Planning Center, agendă zilnică, aer condiționat, Sinclair, EWPE Smart, Alexa | **personal/telegram-assistant/** → §2 + `README.md` |
| asistent vocal, apel cu AI, Gemini Live, orb care pulsează, PWA de voce | `personal/telegram-assistant/public/voce/` + `src/voice/` → §2 |
| aplicație Android, APK, cuvânt de trezire, „Jarvis", fundal, ecran de blocare, Capacitor, Vosk | `personal/telegram-assistant/app/` → §2 |
| Spotify, pus muzică, cântările de duminică pe Spotify, coadă de piese, playlist | `personal/telegram-assistant/src/tools/spotify.js` → §2 |
| notificări push, „sună-mă tu", VAPID, legătură permanentă cu telefonul | `personal/telegram-assistant/src/push.js` + `src/voice/listen.js` → §2 |
| feedback biserică, Pulsul Duminicii, statistici duminică, slideshow pe categorie, rezumat AI feedback, predicatori, Laviniu, Marius, Beni | **personal/pulsul-duminicii/** → §3 + `README.md` |
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
| impeccable vs taste, comparație skill-uri de design, magazin Boabă, cafea de specialitate (demo) | **personal/impeccable-vs-taste/** → §10a |
| nomenclator librărie, import POS, Bluecash50, PLU, coduri de bare, decenu.eu | **profesional/POS NOU/** → §11 |
| site instalații, instalator, Doctor Kumy Instal, sanitare/termice/electrice/climatizare/centrale, ANRE, ISCIR | **profesional/Lead-uri HVAC/standard/doctor-kumy-instal/** → §12 |
| Doctor Kumy varianta design-taste, triaj „Ce s-a întâmplat?", instalatii Tailwind/Vite | **profesional/Lead-uri HVAC/taste/doctor-kumy-instal-taste/** → §12a |
| lead-uri HVAC, firme instalații Oradea, template site instalatii, outreach firme HVAC, Consactiv, Interfrig, Alcano Impex | **profesional/Lead-uri HVAC/** → §14 |
| variante taste HVAC, `<slug>-taste`, triaj/index/tehnic, Archivo/Manrope/Space Grotesk pentru HVAC | **profesional/Lead-uri HVAC/** (secțiunea „Variantele taste" din CLAUDE.md) → §14 |
| Epify hvak, OK Instal Tech, Olah Karoly, Dateo Instal, calculator BTU, instalator Nojorid, centrale pe peleți, site-uri dedicate HVAC | **profesional/Lead-uri HVAC/taste/** (secțiunea „Lotul „Epify hvak"" din CLAUDE.md-ul folderului) → §14 |
| portofoliu fotograf, Petra Butincu, beauty, fashion editorial, campanii de produs, Lumedics, Splendor | **profesional/petra-butincu-portofoliu/** → §13 |
| CAMERA OBSCURĂ, film Petra Butincu, hero cu autoplay, footage generat, storyboard | **profesional/petra-butincu-film/** → §13 (al doilea site, separat) |
| view shooting, highlight-uri, BTS, behind the scenes, burgundy, client fotograf | **profesional/client-fotograf/** → §13 (al treilea site, separat) |
| test de valori, chestionar, radar chart, Misional/Înrădăcinat/Colaborativ/Mobilizat/Implicat/Intențional/Integru/Vizionar | **profesional/profil-valori/** → §14a |
| skill-uri Claude Code, afaceri locale RO, eMag, prețuri cărți, generare site-uri, scroll-film | `.claude/skills/` → §15 |
| import membralitate, import membri, listă SMS → Excel, cod tert, organizatie judeteana/locala, `yso_wopImportTertiWeb` | `.claude/skills/import-membralitate/` → §15 |
| agentul de scor FC Barcelona | `.claude/agents/Show-score.md` |
| notițe personale, vault | e Obsidian, nu cod → §16 |
| fișier gol/orfan/necunoscut găsit prin repo | probabil în §16 — verifică acolo înainte să presupui că e activ |

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
| 12 | doctor-kumy-instal | `profesional/Lead-uri HVAC/standard/doctor-kumy-instal/CLAUDE.md` | — |
| 12a | doctor-kumy-instal-taste | `profesional/Lead-uri HVAC/taste/doctor-kumy-instal-taste/CLAUDE.md` | — |
| 13 | petra-butincu-portofoliu | `profesional/petra-butincu-portofoliu/CLAUDE.md` | `.tmp/grill-me/portofoliu-fotograf.md` (cele 24 de decizii de design) |
| 13 | petra-butincu-film (CAMERA OBSCURĂ) | `profesional/petra-butincu-film/CLAUDE.md` | `docs/storyboard.md` (storyboard, prompturi de motor, paletă, buget) |
| 13 | client-fotograf | `profesional/client-fotograf/CLAUDE.md` | — |
| 14 | Lead-uri HVAC | `profesional/Lead-uri HVAC/CLAUDE.md` | `README.md` (comenzi de build/deploy, adăugarea unei firme noi) |
| 14a | profil-valori | `profesional/profil-valori/CLAUDE.md` | — |

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

Asistent personal cu **trei fețe și un singur creier**: bot de Telegram (text), **apel vocal
în timp real** printr-un PWA, și o **aplicație Android nativă** peste aceeași pagină. Creierul
e Worker-ul: un prompt, **41 de unelte** (plus 2 doar pentru voce — volumul și închiderea
apelului), un istoric — indiferent pe unde vorbești cu el.

Acționează pe Google Calendar, Planning Center Services și aerul condiționat din casă
(Sinclair, prin API-ul neoficial Alexa — aparatul nu are API public), trimite agenda zilnică,
și **te poate căuta el**: notificări programate care sună telefonul. Aplicația nativă adaugă
ce un site nu poate face — apelul continuă când ieși din aplicație, se deschide de pe ecranul
de blocare, și răspunde la cuvântul de trezire **„Jarvis"** (recunoscut local, offline).

În apel îi poți cere și să vorbească mai încet sau mai tare, și să închidă el apelul — două unelte
care se execută în pagină, nu pe server, fiindcă acolo trăiesc difuzorul și apelul.

Cont unic, blocat pe `ALLOWED_TELEGRAM_USER_ID`; apelurile vocale cer `VOICE_ACCESS_TOKEN`.

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
- `src/tools/air-conditioner.js` — aer condiționat (stare, comenzi, programări)
- `src/tools/notificari.js` — programează un apel/o notificare pe telefon
- `src/tools/spotify.js` — Spotify: ce cântă, redare (inclusiv liste puse una după alta prin
  coadă), control, versiuni de cântări ținute minte după corectare
- `src/alexa.js` — client pentru API-ul neoficial Alexa (prin el merge aerul condiționat)
- `src/push.js` — Web Push (VAPID); notificările se trimit **fără conținut**, intenționat
- `src/voice/gemini.js` — protocolul Gemini Live (setup, unelte, reluarea sesiunii)
- `src/voice/session.js` — Durable Object per apel: releu audio, unelte, reconectare
- `src/voice/listen.js` — legătura permanentă (hibernabilă) prin care telefonul poate fi sunat
- `public/voce/` — PWA-ul: microfon, redare, orbul care reacționează la voce
- `app/` — aplicația Android (Capacitor): serviciu de fundal, „Jarvis" (Vosk), apel pe blocat
- `scripts/alexa-login.js` — logarea Alexa, rulată local (`npm run alexa-login`)

**Stare:** Telegram și vocea merg în producție; aplicația Android e construită și instalată
pe telefon (build `debug`, nesemnat pentru magazin). Uneltele de compilare Android stau în
`D:android-tools` (JDK 21 + SDK), **nu în repo**. Complet separat de FF Fitness — singura
suprapunere e că OAuth-ul de Gmail din `personal/ff-fitness/worker/` a fost model pentru cel
de Google Calendar de aici.

**Patru capcane l-au costat cel mai mult, toate eșuând în tăcere** (detalii în CLAUDE.md-ul
lui): `fetch()` respinge `wss://` în Workers; cadrele binare de WebSocket sunt Blob-uri, în
ambele sensuri; adresele relative duc spre telefon în aplicația nativă; iar Android interzice
unui serviciu din fundal să deschidă o aplicație.

### 3. `personal/pulsul-duminicii/` — statistici live pentru feedback-ul de duminică

Site live (Cloudflare Worker, un singur fișier de intrare + câteva module mici),
fără frontend separat, care citește la fiecare vizită Google Sheet-ul din spatele
formularului „Evaluare întâlnire duminică" și randează un raport în stilul
`../librarie/pulsul-duminicii.html` (design-ul original, făcut manual o singură
dată, acum în §8). Adaugă un slideshow pe categorie (Închinare, Rugăciune, Predică
etc.) pentru duminica aleasă — gândit pentru întâlnirea de feedback de luni a
echipei — și un rezumat opțional generat de Claude peste răspunsurile deschise ale
zilei. Are și `/predicatori` — statistici per predicator (Laviniu, Marius, Beni I,
Beni Oz): notă la Predică, trend în timp, și comparație cu restul duminicilor pe
celelalte dimensiuni (Închinare, Rugăciune etc.), citind un al DOILEA Google Sheet
separat („Calendar predicare", cine predică în fiecare duminică) și alăturându-l pe
dată cu Sheet-ul de feedback.

**Setup (service account Google — pentru AMBELE Sheet-uri, secrete, deploy, testare):
`README.md` din acest folder.**

Fișiere:
- `src/index.js` — entry point Worker (`fetch`/`scheduled`), rutare `/`, `/zile`, `/zile/:slug`, `/categorii`, `/categorii/:key`, `/predicatori`, `/predicatori/:slug`
- `src/auth.js` — poarta de acces, comutabilă din `wrangler.toml` (`AUTH_MODE`)
- `src/sheets.js` — auth Google prin service account (JWT semnat cu `crypto.subtle`, fără OAuth interactiv) + citire Sheets API, parametrizat pe `sheetId`/`range` ca să citească ambele Sheet-uri
- `src/config.js` — maparea coloană-Sheet → categorie pentru Sheet-ul de feedback (singurul loc de ajustat dacă se schimbă formularul), plus maparea pentru Sheet-ul „Calendar predicare"
- `src/transform.js` — rânduri brute → `DATA`/`RESPONSES` + toate agregatele, inclusiv `categoryWeeklySeries` (serie săptămânală per categorie, pentru pagina de analiză)
- `src/preachers.js` — parsare „Calendar predicare" → listă `{date, speaker}` + `preacherSlug()` (numele normalizat pentru URL)
- `src/aiSummary.js` — rezumat opțional per duminică (Claude Haiku 4.5), cache KV pe hash de conținut
- `src/aiTrendSummary.js` — analiză AI opțională a tendinței per categorie (Claude Haiku 4.5), doar pentru presetup-urile de interval de pe `/categorii/:cheie` (1/3/6/12 luni, Tot), cache KV
- `src/render.js` — orchestrează fetch→transform→randare, cu fallback din cache la eroare; „Calendar predicare" are propriul cache/fail-soft (`getSchedule()`), izolat de restul
- `src/shared.css`, `src/shared.txt` — stiluri și JS comune tuturor paginilor (temă, meniu, tooltip)
- `src/home.html` — pagina Acasă (statistici generale)
- `src/days.html`, `src/day.html` — lista de duminici și pagina unei duminici (slideshow/dashboard pe categorie; `day.html` arată și predicatorul zilei, dacă e cunoscut)
- `src/categories.html`, `src/category.html` — analiză pe categorie în timp, cu interval selectabil (1/3/6/12 luni, tot, sau custom)
- `src/predicatori.html`, `src/predicator.html` — index predicatori + pagina unui predicator

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
`styles.css`. Fără legătură cu agentul `Show-score` din §15 — acela răspunde live prin
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

### 10a. `personal/impeccable-vs-taste/` — același magazin, construit de trei ori

Experiment de comparație între skill-uri de design: magazinul fictiv **Boabă** (cafea de
specialitate, Oradea, demo fără plată) construit din același `BRIEF.md` și aceleași 20 de
poze (`_poze/`, Higgsfield) în trei variante: `impeccable/` (skill-ul `impeccable`, static),
`taste-skill/` (skill-ul `design-taste-frontend`, Vite + React + Tailwind v4) și
`fara-skill/` (fără skill, static). Concluziile în `COMPARATIE.md`, capturile alăturate în
`compare.html`.

**Regulile (nu amesteca fișiere între variante, datele duplicate intenționat): `personal/impeccable-vs-taste/CLAUDE.md`.**

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

### 12. `profesional/Lead-uri HVAC/standard/doctor-kumy-instal/` — site de prezentare, Doctor Kumy Instal SRL

**Mutat aici pe 17 septembrie 2026** din `profesional/instalatii/` (nume vechi), ca să
respecte convenția de nume-de-folder a celorlalte firme din `Lead-uri HVAC/`. **Rămâne
totuși clientul real, plătitor** — nu un lead de prospectare „cadou" ca restul folderului
și nu trece prin `build.mjs`/`build-taste.mjs` (n-are JSON în `_resurse/_date/`, deci
generatoarele îl ignoră automat). E și în continuare **sursa template-ului** din care au
fost derivate celelalte site-uri — nu-l atinge din greșeală când regenerezi ceva din lot.

Site static de o pagină (fără framework, fără build step, fără backend) pentru
**Doctor Kumy Instal S.R.L.** (Oradea, CUI RO22177152): instalații sanitare, termice,
electrice, climatizare, centrale termice. Identitatea și contactul firmei sunt date
reale, preluate prin scraping din surse publice (ONRC/Termene.ro, Confidas, Cylex) —
rămân `[COMPLETEAZĂ...]` doar câmpurile fără sursă publică de încredere (email, program,
autorizații ANRE/ISCIR). Fără formular de contact, intenționat: doar `tel:`,
WhatsApp (`wa.me`) și `mailto:`.

**Detalii complete (regulile de sincronizare config↔HTML, contrastele WCAG calculate,
checklist de lansare): `profesional/Lead-uri HVAC/standard/doctor-kumy-instal/CLAUDE.md`.**

Fișiere: `index.html` (cele 15 secțiuni + SVG-uri inline + JSON-LD `LocalBusiness`),
`js/config.js` (singurul loc cu datele firmei — alimentează doar `href`-uri, nu text
vizibil), `js/main.js`, `css/styles.css` (Inter auto-hostuit, 2 subseturi de diacritice),
`privacy.html`, `terms.html`, `favicon.svg`, `robots.txt`, `sitemap.xml`, `vercel.json`.
Proiectul Vercel existent (`instalatii`) a rămas neschimbat la mutare — doar folderul
local și-a schimbat calea.

### 12a. `profesional/Lead-uri HVAC/taste/doctor-kumy-instal-taste/` — Doctor Kumy Instal, refăcut cu design-taste

**Mutat aici pe 17 septembrie 2026** din `profesional/instalatii-taste/`, din același
motiv ca §12 — rămâne varianta de design a clientului real, nu un lead de prospectare.

Același conținut și aceleași date ca §12, design refăcut de la zero cu skill-ul
`design-taste-frontend` (13 septembrie 2026): Vite + Tailwind v4 + Motion + Phosphor, fără
React (textul rămâne literal în HTML). Light + dark automat, triaj interactiv în erou în loc
de poză, sloturi marcate pentru pozele reale ale lucrărilor. `noindex` + canonical spre
originalul §12. **Deployat 17 septembrie 2026** — live la
https://doctor-kumy-instal-taste.vercel.app. **Nu înlocuiește §12 și nu atinge sursa
template-ului HVAC.**
Regulile: `profesional/Lead-uri HVAC/taste/doctor-kumy-instal-taste/CLAUDE.md`.

### 13. Petra Butincu — **trei site-uri diferite, pentru aceeași persoană**

Petra Butincu, fotografă din Oradea: beauty, fashion editorial și campanii de produs
cosmetic (clienți vizibili în cadre: Lumedics, Splendor Professional). **Primul client
extern real din repo** — nu demo, nu șablon.

Există **trei abordări construite separat, în foldere diferite**, care nu împart
niciun fișier și nu știu una de alta. Nu le amesteca; întreabă care e varianta pe care
o duce mai departe clienta înainte să investești în vreuna.

**Notă:** a existat și o a patra variantă (`profesional/petra/`, „Studio Alb") —
ștearsă din repo (2026-09-11) la cererea utilizatorului, care nu era mulțumit de ea.
Dacă mai vezi referințe la ea prin cod vechi sau documente uitate, e istoric mort, nu
un proiect activ; era live pe `petra-zeta.vercel.app`, care rămâne stale dacă nu e și
oprit din Vercel.

| Folder | Ce e |
|---|---|
| `profesional/petra-butincu-portofoliu/` | Portofoliul clasic, descris mai jos. React + Vite, temă închisă. |
| `profesional/petra-butincu-film/` | **„CAMERA OBSCURĂ"** — site static, fără build step, cu footage generat (Higgsfield). Titlul + o cutie cu film redă singur, în buclă (`<video autoplay loop>`, `site/film.mp4`); restul paginii se derulează normal. **Nu mai e scroll-film** — a fost convertit din varianta originală full-bleed scrubată la scroll, la cererea utilizatorului (vezi „Istoric" din CLAUDE.md-ul lui). `site/frames/` (cadrele vechiului motor de canvas) rămân doar ca istoric, ignorate din git — regenerabile din `site/film.mp4`. |
| `profesional/client-fotograf/` | Al treilea site (11 sept 2026), static, fără build step. Combină cerințe noi ale clientei — pagină de „shooting" cu highlight-uri + BTS în prim-plan, nume CAPS pe fond serif, paletă negru/burgundy — cu piese luate din celelalte două: coloanele parallax cu card fix din portofoliu, fundalul Ken Burns din portofoliu, filmul cinematic din CAMERA OBSCURĂ (dar redă singur în buclă, nu legat de scroll). Detalii în `profesional/client-fotograf/CLAUDE.md`. |

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

### 14. `profesional/Lead-uri HVAC/` — 8 site-uri de prezentare, generate dintr-un template

**8 site-uri „cadou"** (playbook `personal/primul-client/`) pentru 8 firme HVAC/instalații
din Oradea și Bihor, generate dintr-un **template parametrizat** derivat din
`profesional/Lead-uri HVAC/standard/doctor-kumy-instal/` (site-ul real al Doctor Kumy
Instal — sursa template-ului, niciodată atinsă de generator, deși stă acum fizic în
același folder — vezi §12). Fiecare firmă = un JSON în `_date/`, transformat de
`_generator/build.mjs` într-un site complet într-un folder cu numele ei; `mesaje/*.md`
ține mesajul de outreach gata de trimis pentru fiecare.

O a 9-a firmă, Hashtag Becool, a fost scoasă din acest folder pe 12 septembrie 2026
(rebranduită între timp în Articool, cu propriul site) — vezi nota din
`profesional/Lead-uri HVAC/CLAUDE.md`.

**Toate 8 sunt `noindex`** (pagini de prezentare pre-adopție, template comun → risc de
conținut duplicat) și **4 din 8 sunt blocate la trimitere** — directoarele românești de
firme (ListaFirme, PaginiAurii, daibau.ro, necesit.ro) maschează sistematic telefonul din
spatele unui formular de lead-gen; fără număr complet, site-ul e live dar firma nu poate
fi contactată prin el. Detalii complete, status per firmă și regulile de conținut (fără
promisiuni neconfirmate, fără recenzii inventate): `profesional/Lead-uri HVAC/CLAUDE.md`.

**Citește-l înainte să regenerezi orice site de-acolo sau să adaugi o firmă nouă** — nu
edita direct un folder de firmă, editează `_date/<slug>.json` și rulează generatorul.
**Excepție: `geocam-trans/`** — din 13 septembrie 2026 e site dedicat (triaj interactiv,
casa în secțiune, animații), scos din generator (`"bespoke": true`); se editează direct.

**14 septembrie 2026:** fiecare din cele 7 firme (nu și `geocam-trans/`) a primit și o
**a doua variantă de design**, `<slug>-taste/` (ex. `furik-com-taste/`), făcută cu skill-ul
`design-taste-frontend` — 3 direcții vizuale distincte (triaj cald / index editorial / fișă
tehnică pe temă închisă), fiecare aplicată la 2-3 firme. Explorare paralelă, nu înlocuiește
`<slug>/`; nimic deployat. Detalii, asignarea firmă→variantă și comenzile de regenerare:
secțiunea „Variantele taste" din `profesional/Lead-uri HVAC/CLAUDE.md`.

**15 septembrie 2026:** încă **3 firme** din documentul Drive „Epify hvak" — OK Instal Tech
(cu cele 91 de poze reale luate de pe site-ul lor vechi Site123), Dateo Instal (calculator
BTU) și Instalații sanitare și termice Nojorid (fără nume legal cunoscut, condus de cele 12
recenzii de 5★) — au site-uri **dedicate, scrise de mână**, doar în `taste/<slug>-taste/`,
nedeployate. Nu trec prin generator: pozele/galeria se pregătesc cu
`_resurse/_generator/pregateste-bespoke.mjs`, verificarea cu `verifica-bespoke.mjs`.
Secțiunea „Lotul „Epify hvak"" din `profesional/Lead-uri HVAC/CLAUDE.md`.

### 14a. `profesional/profil-valori/` — test de valori cu radar

Site static (fără framework, build sau backend): 40 de afirmații scurte, notate pe o
scală de 5 (stânga = nu mă regăsesc, dreapta = mă regăsesc mult), iar la final un radar pe
8 valori (Misional, Înrădăcinat, Colaborativ, Mobilizat, Implicat, Intențional, Integru,
Vizionar) cu top 3 și print. Are și `admin.html`, pentru adăugat/editat/șters întrebări și
schimbat ce valoare măsoară fiecare (fără backend, deci personalizarea stă local, în
browserul administratorului). Conținutul implicit stă în `js/data.js`, echilibrul se
verifică cu `node verifica.mjs`, iar starea testului stă în `localStorage`. Design cu
`design-taste-frontend`, nedeployat. Regulile de scor și de formulare:
`profesional/profil-valori/CLAUDE.md`.

## 15. `.claude/` — tooling Claude Code (agent + skill-uri), separat de toate aplicațiile

- Agent `Show-score` — scor FC Barcelona (Haiku 4.5 + WebSearch)
- Skill `afaceri-locale-ro` — director de afaceri RO din OpenStreetMap → CSV
- Skill `website-afaceri-ro` — generează site de-o-pagină pentru o afacere locală
- Skill `emag-cauta` — compară produse pe eMag.ro după preț/recenzii
- Skill `pret-carte-ro` — caută prețul unei cărți în librăriile RO
- Skill `skill-builder` — construiește/verifică alte skill-uri Claude Code
- Skill `scroll-film-studio` — site-uri cu film derulat la scroll (a construit §4)
- Skill `import-membralitate` — listă de contacte (ex. listă de SMS-uri) → Excel de import
  în sistemul de membralitate, plus diagnosticul erorilor de cod invalid. Nu ține de niciun
  proiect din repo. **Capcana:** `judet` și `organizatie judeteana` sunt nomenclatoare
  diferite (`tm` e valid la primul, nu există la al doilea) — detalii în
  `references/nomenclatoare.md` al skill-ului

Flux tipic: `afaceri-locale-ro` → CSV → `website-afaceri-ro` → HTML în `rezultate/`.

## 16. Nu sunt proiecte active — ignoră dacă nu ești rugat explicit de ele

- `api/` — folder gol, rămășiță de dinainte de migrarea backend-ului la Cloudflare Worker.
- `player.gd` — script Godot orfan (gitignored), fără legătură cu nimic din acest repo.
- `test/index.html` — pagină demo generată de skill-ul `website-afaceri-ro` (clinică
  dentară fictivă, Oradea) — nu un test al FF Fitness.
- `.obsidian/` — acest folder e deschis și ca vault Obsidian pentru notițe personale.
  Config, nu cod.
- `profesional/petra-butincu/` — folder gol, orfan (fără fișiere, doar directorul).
  Nu face parte din niciunul din cele trei proiecte Petra Butincu (§13) — nu-l
  confunda cu `profesional/petra-butincu-film/` sau `profesional/client-fotograf/`.

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
