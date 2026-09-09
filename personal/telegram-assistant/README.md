# telegram-assistant

Bot personal pe Telegram, pe Cloudflare Workers (Agents SDK), care înțelege cereri în
limbaj natural și acționează — acces complet la Google Calendar: creează, caută,
modifică și șterge evenimente. Detalii de arhitectură complete: `../../.claude/plans`
(planul aprobat) — mai jos doar pașii operaționali.

## Instalare

```bash
cd telegram-assistant
npm install
```

## Secrete necesare (`wrangler secret put NUME`)

| Secret | De unde |
|---|---|
| `TELEGRAM_BOT_TOKEN` | `@BotFather` → `/newbot` |
| `TELEGRAM_WEBHOOK_SECRET` | generat de tine (ex. `openssl rand -hex 32`) |
| `ANTHROPIC_API_KEY` | consola Anthropic |
| `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` | Google Cloud Console → Credentials → OAuth client ID (tip Desktop app) — **separat** de `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` din `worker/` |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | OAuth 2.0 Playground (vezi mai jos) |
| `ALLOWED_TELEGRAM_USER_ID` | ID-ul tău numeric de Telegram (ex. via `@userinfobot`) |
| `INTERNAL_ADMIN_SECRET` | generat de tine — protejează ruta internă `/internal/run-daily-agenda` |
| `PLANNING_CENTER_APP_ID` / `PLANNING_CENTER_SECRET` | Personal Access Token din Planning Center (vezi mai jos) |

`DEFAULT_TIMEZONE`, `GOOGLE_CALENDAR_ID` și `DAILY_AGENDA_HOUR` sunt în `wrangler.toml` (`[vars]`), nu secrete.

## Configurare Google Calendar OAuth (o singură dată)

1. Google Cloud Console (același proiect folosit deja pentru Gmail în `worker/`) →
   **APIs & Services → Library** → activează **Google Calendar API**.
2. **OAuth consent screen** → adaugă scope-ul `https://www.googleapis.com/auth/calendar.events`.
3. **Credentials → Create Credentials → OAuth client ID** → tip **Web application** (NU
   Desktop app — Playground dă `redirect_uri_mismatch` cu Desktop app) → la
   **Authorized redirect URIs** adaugă `https://developers.google.com/oauthplayground` →
   notează Client ID + Client Secret (secrete noi, separate de cele de Gmail).
4. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → ⚙️ (Settings) →
   bifează "Use your own OAuth credentials" → introdu Client ID/Secret de la pasul 3.
5. În panoul din stânga, găsește **Google Calendar API v3**, selectează scope-ul
   `.../auth/calendar.events` → **Authorize APIs** → autentifică-te cu contul Google
   pe care vrei să-l folosești pentru calendar → consimte.
6. **Exchange authorization code for tokens** → copiază `refresh_token` →
   `wrangler secret put GOOGLE_CALENDAR_REFRESH_TOKEN`.

## Configurare Planning Center API (o singură dată)

1. Autentifică-te la [planningcenteronline.com](https://www.planningcenteronline.com) cu
   contul care are acces la Services (și, dacă vrei `search_people`, la People).
2. Mergi la [api.planningcenteronline.com/oauth/applications](https://api.planningcenteronline.com/oauth/applications).
3. Caută secțiunea **Personal Access Tokens** (diferită de "OAuth Applications" de mai sus
   pe aceeași pagină) → creează un token nou, cu un nume descriptiv (ex. "telegram-assistant").
4. Planning Center îți arată o pereche **Application ID** + **Secret** — Secret-ul se
   afișează o singură dată, copiază-l imediat.
5. Setează-le ca secrete în Worker:
   ```bash
   npx wrangler secret put PLANNING_CENTER_APP_ID
   npx wrangler secret put PLANNING_CENTER_SECRET
   ```
6. Verificare rapidă din terminal (înlocuiește `APP_ID`/`SECRET`):
   ```bash
   curl -u APP_ID:SECRET https://api.planningcenteronline.com/services/v2/service_types
   ```
   Ar trebui să primești JSON cu lista tipurilor de serviciu, nu `401 Unauthorized`.

Notă: token-ul are exact drepturile contului tău Planning Center (același nivel de acces
ca atunci când te loghezi manual) — dacă botul trebuie doar să citească, folosește un cont
cu rol limitat dacă organizația ta are unul.

## Deploy și înregistrare webhook

```bash
npx wrangler deploy
```

După deploy, notează URL-ul Worker-ului (`https://telegram-assistant.<subdomeniu>.workers.dev`),
apoi:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://telegram-assistant.<subdomeniu>.workers.dev/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=%5B%22message%22%5D"

curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Verifică în răspunsul `getWebhookInfo` că `url` e corect și `last_error_message` e gol.

## Dezvoltare locală

```bash
npm run dev
```

`wrangler dev` pornește un tunel local — pentru teste reale prin Telegram e nevoie de un
URL public (ex. `wrangler dev --remote`, sau înregistrează webhook-ul temporar către
domeniul de preview after `wrangler deploy`).

## Verificare end-to-end

- "pune o întâlnire mâine la ora 15:00 cu X" → evenimentul apare corect în Google Calendar.
- "am o întâlnire" (fără dată) → botul întreabă, nu creează nimic.
- "mută întâlnirea cu X la ora 17:00" → botul caută evenimentul, îl găsește și îl modifică
  (sau întreabă, dacă găsește mai multe potriviri).
- "șterge întâlnirea cu X de mâine" → botul caută evenimentul, cere confirmare cu titlu/dată/oră,
  apoi îl șterge abia după ce utilizatorul confirmă explicit.
- Mesaj de la alt cont Telegram → ignorat complet, fără reply.
- Bot adăugat într-un grup → ignoră mesajele de grup.
- "ce cântări avem duminică" → botul listează tipurile de serviciu (dacă sunt mai
  multe și nu e clar la care te referi, întreabă), găsește planul de duminică și
  răspunde cu ordinea de serviciu.
- "cine e programat săptămâna asta" → botul răspunde cu echipa/rolurile din planul găsit.
- "confirmă/refuză programarea lui X" → botul cere clarificare dacă nu găsește exact o
  persoană/poziție neambiguă, altfel confirmă pe scurt ce a schimbat.
- "vreau să mă înscriu la [poziție] pe [dată]" → botul te înscrie direct (status
  confirmat) pe poziția respectivă din planul găsit.
- "vreau să mă șterg de pe programarea la [poziție] din [dată]" → botul găsește
  programarea și o șterge definitiv (nu doar o marchează refuzată).
- "top 5 cântări din ultimul an" / "cine a fost cel mai des programat în ultimele 6 luni"
  → botul analizează toate planurile din interval (poate dura câteva secunde) și
  răspunde cu clasamentul.
- `npx wrangler tail` în timpul testelor, pentru a vedea excepții neprinse.

## Agenda zilnică automată

În fiecare zi la ora `DAILY_AGENDA_HOUR` (implicit 20:00, `wrangler.toml`), fiecare agent
(conversație) trimite singur pe Telegram evenimentele din ziua următoare — fără să implice
Claude (e o simplă listare din Calendar, deterministă, gratuită). Se auto-reprogramează în
lanț, ținând cont corect de ora de vară/iarnă (`src/datetime.js`).

Pornește automat o singură dată, la prima trezire a agentului după deploy — nu necesită nicio
acțiune manuală după aceea. Pentru re-testare sau retrimitere la cerere:

```bash
curl -X POST "https://telegram-assistant.<subdomeniu>.workers.dev/internal/run-daily-agenda?chatId=<CHAT_ID>" \
  -H "X-Internal-Secret: <INTERNAL_ADMIN_SECRET>"
```

Anulează programarea curentă și trimite imediat agenda; la final se reprogramează normal,
pentru următoarea ocurență de `DAILY_AGENDA_HOUR`.

## Unelte viitoare (nu sunt construite acum)

- `send_email` — portabil aproape identic din `worker/index.js` (`getGmailAccessToken`/`sendGmailEmail`).
- `create_reminder` — folosește `this.schedule(...)` pe `AssistantAgent`, fără o clasă `Agent` nouă.
- `find_free_slot` — același helper OAuth, folosind `find_calendar_events` (deja construit) ca bază.
