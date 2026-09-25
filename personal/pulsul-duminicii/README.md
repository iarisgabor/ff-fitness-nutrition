# pulsul-duminicii

Site live de statistici pentru feedback-ul săptămânal al bisericii (formularul
„Evaluare întâlnire duminică"), plus **Program duminică** (pregătirea fiecărei duminici,
cu slide-uri/PPT urcate) și **conturi**: `BisericaLogos` vede tot, fiecare predicator își
vede statisticile lui și duminicile care urmează. Citește direct din Google Sheet-ul din spatele
formularului la fiecare vizită — nu există niciun pas manual de refresh. Design
evoluat din raportul static `../librarie/pulsul-duminicii.html`. Plan aprobat:
`.claude/plans` din sesiunea în care a fost construit (sau `git log` pe acest folder).

## Aplicația pe telefon

Site-ul se poate instala ca aplicație (PWA) — apare pe ecranul principal, se deschide pe tot
ecranul, cu bară de navigare jos, și arată paginile deja deschise și fără semnal.

- **Android (Chrome):** după login apare „Pulsul, ca aplicație → Instalează" (o singură dată);
  oricând din butonul de cont (cercul cu inițiale, sus-dreapta) → **Instalează aplicația**, sau
  din meniul ⋮ al Chrome → *Instalează aplicația*.
- **iPhone (Safari):** butonul **Share** → **Adaugă pe ecranul principal** → **Adaugă**. Pașii
  apar și în aplicație (butonul de cont → *Instalează pe iPhone*).
- **Desktop (Chrome/Edge):** meniul ☰ → *Instalează aplicația*, sau iconița din bara de adrese.

**Aplicație Android (APK / Google Play):** `android/` — construită automat în GitHub Actions,
fișierul `.apk` se descarcă de la *Actions → Android Pulsul Duminicii → Artifacts* și se trimite
direct oamenilor. Pași (secretele de semnare, instalare, Google Play): `android/README.md`.

**Fără semnal:** fiecare pagină deschisă cu conexiune se salvează pe dispozitiv (ex. programul
duminicii, deschis acasă, se vede și în sală fără semnal), cu o bandă „offline — salvată la …".
Modificările nu se pot face offline. La **Ieșire** tot ce era salvat se șterge.

## Instalare

```bash
cd pulsul-duminicii
npm install
```

## Secrete necesare (`wrangler secret put NUME`)

| Secret | De unde |
|---|---|
| `ADMIN_PASSWORD` | opțional — dacă e setat, înlocuiește parola contului general `BisericaLogos` dată de `ADMIN_PASSWORD_HASH` din `wrangler.toml` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | fișierul JSON al service account-ului (vezi mai jos) — câmpul `client_email` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | același JSON — câmpul `private_key` (cu tot cu `-----BEGIN/END PRIVATE KEY-----`) |
| `SITE_PASSWORD` | doar dacă schimbi `AUTH_MODE` în `"password"` (implicit e `"accounts"`) |
| `ANTHROPIC_API_KEY` | consola Anthropic — opțional, activează rezumatul AI per duminică și analiza AI de tendință de pe `/categorii/:cheie` |

`AUTH_MODE`, `ADMIN_USERNAME` și `GOOGLE_SHEET_ID` sunt în `wrangler.toml` (`[vars]`), nu secrete.

## Program duminică + conturi — setup (o singură dată)

Programul stă într-o bază **Cloudflare D1**, fișierele urcate într-un bucket **R2** privat,
sesiunile în KV-ul existent (`PULSUL_KV`). Toate trei au plan gratuit suficient.

### Varianta automată (recomandată): GitHub Actions

`.github/workflows/deploy-pulsul-duminicii.yml` face deploy la fiecare push pe `main` care
atinge acest folder (sau manual, din tab-ul Actions → „Run workflow"): creează baza D1 dacă
lipsește, aplică migrațiile noi, folosește R2 doar dacă e activat, face deploy și verifică
`/login`. Singura configurare, o dată:

1. Cloudflare → My Profile → API Tokens → Create Token → șablonul **Edit Cloudflare
   Workers** → **+ Add more** → Account · **D1** · Edit → Create Token.
2. GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:
   `CLOUDFLARE_API_TOKEN` = tokenul de mai sus.
3. (Opțional) Cloudflare → R2 → activează, pentru urcarea de fișiere.
   **Stare: R2 activat în cont (2026-09-25)** — bucket-ul `pulsul-resurse` e creat de workflow.

**Parola contului general** nu e un secret de setat: `ADMIN_PASSWORD_HASH` din
`wrangler.toml` e hash-ul PBKDF2 al unei parole aleatoare generate cu
`node scripts/admin-password.mjs`. Pentru o parolă nouă rulezi scriptul, înlocuiești linia
și faci push. Hash-ul poate sta public doar pentru că parola e aleatoare și lungă — nu
genera hash-ul unei parole alese de mână.

### Varianta manuală, din laptop

```bash
cd personal/pulsul-duminicii

# 1. Baza de date a programului + conturilor
npx wrangler d1 create pulsul-duminicii
#    -> copiază database_id-ul afișat în wrangler.toml, la [[d1_databases]]
npx wrangler d1 migrations apply DB --remote

# 2. Stocarea fișierelor (PPT, PDF, slide-uri)
#    Întâi: dashboard Cloudflare -> R2 -> activează R2 (cere un card pe cont,
#    dar nu taxează nimic sub 10 GB / lună). Apoi:
npx wrangler r2 bucket create pulsul-resurse

# 3. Deploy (parola BisericaLogos vine din ADMIN_PASSWORD_HASH din wrangler.toml)
npx wrangler deploy
```

După deploy:
1. Intră cu `BisericaLogos` + parola generată (cea din care e făcut `ADMIN_PASSWORD_HASH`).
2. Meniul ☰ → **Conturi predicatori** → creează câte un cont pentru fiecare predicator
   (lista vine din „Calendar predicare"). Parola i-o dai personal; și-o poate schimba
   din meniul lui → „Schimbă parola".
3. **Program duminică** → „+ Duminică nouă" (sau „Creează" pe o duminică din calendar).
   Predicatorul se completează singur din calendar; programul pornește de la șablonul
   standard (`src/programTemplate.js`) sau ca o copie a unei duminici anterioare.
4. După fiecare întâlnire, trece **Prezența** în detaliile duminicii — apare în
   statisticile predicatorului.

Dacă R2 nu e încă activat, poți face deploy fără el doar comentând blocul `[[r2_buckets]]`
din `wrangler.toml`: site-ul merge, iar la resurse se pot adăuga doar linkuri (Drive,
Slides, YouTube) până activezi R2.

## Configurare Google Sheets — service account (o singură dată)

Spre deosebire de Gmail/Calendar din celelalte proiecte din acest repo, aici nu e
nevoie de OAuth interactiv sau de refresh token — un service account cu acces
Viewer pe un singur Sheet e suficient și mai simplu de întreținut.

1. [Google Cloud Console](https://console.cloud.google.com) → alege sau creează un
   proiect (poate fi același folosit deja pentru Gmail în `worker/`, sau unul nou).
2. **APIs & Services → Library** → caută și activează **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create Service Account** → nume descriptiv
   (ex. `pulsul-duminicii-reader`) → **nu** e nevoie de niciun rol la nivel de proiect
   (Continue → Done).
4. Deschide service account-ul creat → tab **Keys → Add Key → Create new key** →
   tip **JSON** → se descarcă un fișier — păstrează-l în siguranță, nu-l commite.
5. Din JSON, copiază:
   - `client_email` → `wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
     (lipește-l exact cum e în JSON, cu `\n` — codul din `src/sheets.js` le
     normalizează oricum).
6. Deschide Google Sheet-ul real (cel din spatele formularului „Evaluare întâlnire
   duminică", [id `1NIRVF-Dfxbu3BweApf9eWhMW80ZLeXw6RGPAVAQieic`](https://docs.google.com/spreadsheets/d/1NIRVF-Dfxbu3BweApf9eWhMW80ZLeXw6RGPAVAQieic/edit))
   → **Share** → adaugă adresa de la `client_email` (arată ca un email normal, gen
   `nume@proiect.iam.gserviceaccount.com`) cu rol **Viewer**. Fișierul e deținut de
   `butmarius@gmail.com`, deci pasul ăsta trebuie făcut de cineva cu drept de editare
   pe el (Marius sau altcineva din echipă cu acces), nu neapărat de tine.
7. `GOOGLE_SHEET_ID` e deja completat în `wrangler.toml` (`1NIRVF-Dfxbu3BweApf9eWhMW80ZLeXw6RGPAVAQieic`).
8. **Repetă pasul 6, dar pentru al doilea Sheet** — „Calendar predicare"
   ([id `1LVHzHB4z_dGm5v9xsnp_i2NotgUVGnBdmzpv3XsWpN0`](https://docs.google.com/spreadsheets/d/1LVHzHB4z_dGm5v9xsnp_i2NotgUVGnBdmzpv3XsWpN0/edit)),
   folosit de paginile `/predicatori`. E un fișier diferit, cu alt proprietar — trebuie
   distribuit separat către același `client_email`, cu rol **Viewer**, de cineva cu drept
   de editare pe el. `PREACHERS_SHEET_ID` e deja completat în `wrangler.toml`. Fără acest
   pas, `/predicatori` rămâne funcțional dar gol, cu un mesaj explicativ (vezi CLAUDE.md,
   regula 15) — restul site-ului nu e afectat.

`src/config.js` a fost deja verificat contra headerului real al Sheet-ului (tab-ul
se numește „Răspunsuri la formular 1", `SHEET_RANGE` e deja setat corect) — nu ar
trebui să mai fie nevoie de ajustări, decât dacă formularul se schimbă în viitor
(întrebări adăugate/redenumite), caz în care acesta e singurul fișier de atins.

## Deploy

```bash
npx wrangler kv namespace create PULSUL_KV   # o singură dată — pune id-ul rezultat în wrangler.toml
npx wrangler deploy
```

Site-ul apare la `https://pulsul-duminicii.<subdomeniu>.workers.dev` — link
neafișat public (nu-l trimite decât direct echipei), `AUTH_MODE = "none"` implicit.

## Dezvoltare locală

`public/` (fonturi, iconițe, manifest, service worker, pagina offline) e servit de `wrangler
dev` la fel ca în producție. Service worker-ul merge și pe `http://127.0.0.1` (browserele
tratează localhost ca sigur); dacă vrei să vezi imediat o schimbare în `sw.js`, bifează
*Update on reload* în DevTools → Application → Service workers.

```bash
cp .dev.vars.example .dev.vars   # completează cu valorile reale sau cu un service
                                   # account/Sheet de test; ADMIN_PASSWORD e obligatoriu
npx wrangler d1 migrations apply DB --local   # D1, R2 și KV sunt simulate local
npm run dev
```

## Verificare end-to-end

Conturi și program:
- Fără sesiune, orice pagină duce la `/login`; API-ul răspunde 401.
- `BisericaLogos` vede tab-urile **Analiză · Program duminică**; un predicator vede
  **Statisticile mele · Program duminică**, iar `/`, `/categorii`, `/predicatori` îl trimit la `/eu`.
- Predicatorul poate modifica doar elementele din PREDICA la duminica lui (plus cele unde
  e trecut la „Cine") și poate urca resurse doar la duminica lui; restul răspunde 403.
- Un fișier urcat se descarcă identic de la `/resurse/:id`, și nu se poate descărca fără login.
- După 10 parole greșite de pe același IP, login-ul e blocat 15 minute.

Analiză:

- Pagina se încarcă și arată date reale din Sheet, nu eroare de autentificare
  (verifică în consola `wrangler dev` — cel mai frecvent eșec la prima rulare e
  service account-ul neadăugat încă drept Viewer pe Sheet, sau `SHEET_RANGE`
  greșit).
- Dial-ul din hero, KPI-urile, barele pe dimensiuni, distribuțiile, trendul lunar,
  vârstele și citatele se populează corect.
- Alege o duminică cu mai multe răspunsuri la aceeași categorie (ex. Predică) →
  taburile de categorie apar doar pentru categoriile cu răspunsuri în acea zi →
  navigare prev/next și tastele săgeți stânga/dreapta funcționează, contorul
  „N din M" e corect.
- Dacă ai setat `ANTHROPIC_API_KEY`: rezumatul AI apare deasupra taburilor pentru
  zilele cu text liber; a doua încărcare a aceleiași zile nu mai apelează Claude
  (verifică din `wrangler tail` — nu ar trebui să vezi un nou apel către
  `api.anthropic.com` la refresh repetat).
- Fără `ANTHROPIC_API_KEY` setat: blocul de rezumat AI nu apare deloc, restul
  paginii funcționează normal.
- Simulează o eroare (schimbă temporar `GOOGLE_SHEET_ID` cu unul greșit, după ce
  ai avut deja o încărcare reușită) → pagina arată banner-ul „date posibil
  neactualizate" cu ultima versiune bună, nu o eroare goală.
- Light/dark mode (moștenit din raportul static original) arată corect în ambele.
- `npx wrangler tail` în timpul testelor, pentru excepții neprinse.
- `/predicatori` arată cardurile predicatorilor cu duminici suprapuse peste feedback;
  `/predicatori/:slug` arată trendul la Predică, tabelul comparativ și citatele lui.
  Dacă service account-ul nu a fost încă adăugat Viewer pe „Calendar predicare", pagina
  arată un mesaj explicativ în loc de date — nu o eroare, și restul site-ului rămâne intact.
- Pe `/zile/:slug`, pentru o duminică din calendarul de predicare, apare chip-ul
  „Predică: Nume" cu link spre pagina predicatorului respectiv.

## Schimbarea modelului de acces sau de refresh

Ambele sunt seam-uri intenționat izolate:

- **Acces**: implicit `"accounts"` (vezi mai sus). Alternativ, `AUTH_MODE` în `wrangler.toml` (`"none"` / `"password"` —
  setează și `SITE_PASSWORD` — / `"access"` — configurează separat un Cloudflare
  Access Application din dashboard Zero Trust, gratuit până la 50 utilizatori).
- **Refresh**: implicit e live la fiecare vizită, cu fallback din cache la eroare
  (`src/render.js`, `getRenderedPage`). Dacă vreți strict un refresh programat
  lunea (nu live), adăugați un `[triggers]` cu `crons` în `wrangler.toml` care
  apelează `scheduled()` din `src/index.js` (deja scris, doar neactivat) și, opțional,
  eliminați apelul live din `fetch()` ca să citească doar din cache.
