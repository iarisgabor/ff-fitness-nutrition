# pulsul-duminicii

Site live de statistici pentru feedback-ul săptămânal al bisericii (formularul
„Evaluare întâlnire duminică"). Citește direct din Google Sheet-ul din spatele
formularului la fiecare vizită — nu există niciun pas manual de refresh. Design
evoluat din raportul static `../librarie/pulsul-duminicii.html`. Plan aprobat:
`.claude/plans` din sesiunea în care a fost construit (sau `git log` pe acest folder).

## Instalare

```bash
cd pulsul-duminicii
npm install
```

## Secrete necesare (`wrangler secret put NUME`)

| Secret | De unde |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | fișierul JSON al service account-ului (vezi mai jos) — câmpul `client_email` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | același JSON — câmpul `private_key` (cu tot cu `-----BEGIN/END PRIVATE KEY-----`) |
| `SITE_PASSWORD` | doar dacă schimbi `AUTH_MODE` în `"password"` (implicit e `"none"`) |
| `ANTHROPIC_API_KEY` | consola Anthropic — opțional, activează rezumatul AI per duminică și analiza AI de tendință de pe `/categorii/:cheie` |

`AUTH_MODE` și `GOOGLE_SHEET_ID` sunt în `wrangler.toml` (`[vars]`), nu secrete.

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

```bash
cp .dev.vars.example .dev.vars   # completează cu valorile reale sau cu un service
                                   # account/Sheet de test
npm run dev
```

## Verificare end-to-end

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

## Schimbarea modelului de acces sau de refresh

Ambele sunt seam-uri intenționat izolate:

- **Acces**: schimbă `AUTH_MODE` în `wrangler.toml` (`"none"` / `"password"` —
  setează și `SITE_PASSWORD` — / `"access"` — configurează separat un Cloudflare
  Access Application din dashboard Zero Trust, gratuit până la 50 utilizatori).
- **Refresh**: implicit e live la fiecare vizită, cu fallback din cache la eroare
  (`src/render.js`, `getRenderedPage`). Dacă vreți strict un refresh programat
  lunea (nu live), adăugați un `[triggers]` cu `crons` în `wrangler.toml` care
  apelează `scheduled()` din `src/index.js` (deja scris, doar neactivat) și, opțional,
  eliminați apelul live din `fetch()` ca să citească doar din cache.
