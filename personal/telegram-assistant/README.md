# telegram-assistant

Asistent personal cu trei căi de acces și un singur creier: **bot de Telegram**, **apel vocal**
printr-un PWA, și o **aplicație Android** nativă. Acționează pe Google Calendar, Planning Center
și aerul condiționat din casă, trimite agenda zilnică, și te poate căuta el prin notificări.

Mai jos doar pașii operaționali. **Harta de cod și deciziile de design: `CLAUDE.md`.**

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
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | developer.spotify.com → Create app (vezi mai jos) |
| `SPOTIFY_REFRESH_TOKEN` | ruta `/spotify/auth` a Worker-ului (vezi mai jos) |
| `ALLOWED_TELEGRAM_USER_ID` | ID-ul tău numeric de Telegram (ex. via `@userinfobot`) |
| `INTERNAL_ADMIN_SECRET` | generat de tine — protejează ruta internă `/internal/run-daily-agenda` |
| `PLANNING_CENTER_APP_ID` / `PLANNING_CENTER_SECRET` | Personal Access Token din Planning Center (vezi mai jos) |
| `ALEXA_REFRESH_TOKEN` | pus automat de `npm run alexa-login` (aer condiționat, vezi mai jos) — **dă acces la contul Amazon** |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey — cont gratuit, fără card. Pentru apelul vocal. |
| `VOICE_ACCESS_TOKEN` | generat de tine — poarta spre toate rutele `/voice-*` |
| `VAPID_PRIVATE_KEY` | perechea privată a lui `VAPID_PUBLIC_KEY` din `wrangler.toml` (vezi „Notificări") |

`DEFAULT_TIMEZONE`, `GOOGLE_CALENDAR_ID`, `DAILY_AGENDA_HOUR`, `ALEXA_*` (fără token),
`GEMINI_*`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` și `TWA_*` sunt în `wrangler.toml` (`[vars]`),
nu secrete.

> **`VOICE_ACCESS_TOKEN` apare în DOUĂ locuri** și trebuie să fie identic: ca secret pe Worker,
> și împachetat în aplicația Android la `app/android/app/src/main/res/values/token.xml`
> (gitignorat). **Niciodată în `public/voce/`** — folderul acela e servit public pe internet.

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

## Configurare Gmail — citire + ciorne (o singură dată)

Jarvis poate **citi** mailul și poate **scrie ciorne**. Nu poate trimite, și asta nu e o setare
care se poate schimba din greșeală: nu există nicio unealtă care să cheme `messages/send` (vezi
regula 61 din `CLAUDE.md`).

> **Fă pașii ăștia ÎNAINTE de a te baza pe funcție.** `gmail.readonly` e un scope **restricted**,
> o categorie peste `calendar.events` (care e doar *sensitive*). Dacă ecranul de consimțământ e
> în modul **Testing**, refresh tokenurile expiră în **7 zile** — deci autorizează, și
> verifică peste o săptămână că încă merge, înainte să te obișnuiești cu ea.

1. Google Cloud Console (același proiect) → **APIs & Services → Library** → activează **Gmail API**.
2. **OAuth consent screen** → adaugă scope-urile `https://www.googleapis.com/auth/gmail.readonly`
   și `https://www.googleapis.com/auth/gmail.compose`.
3. **Credentials** → poți refolosi clientul Web creat pentru Calendar (are deja
   `https://developers.google.com/oauthplayground` la redirect URIs).
4. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → ⚙️ → "Use your own
   OAuth credentials" → Client ID/Secret → selectează **doar cele două scope-uri de Gmail** →
   **Authorize APIs** → **Exchange authorization code for tokens** → copiază `refresh_token`.
5. ```bash
   wrangler secret put GMAIL_CLIENT_ID       # aceeași valoare ca la Calendar
   wrangler secret put GMAIL_CLIENT_SECRET   # aceeași valoare ca la Calendar
   wrangler secret put GMAIL_REFRESH_TOKEN   # cel NOU, de la pasul 4
   ```
   `GMAIL_FROM_ADDRESS` e deja în `[vars]` din `wrangler.toml`.

**De ce un refresh token separat și nu cel de Calendar, reautorizat cu scope-uri în plus:** un
403 de Gmail (API neactivat, scope neacordat) golește cache-ul de token și, dacă tokenul ar fi
comun, ar cădea și calendarul. În plus, reautorizarea ar însemna înlocuirea unui secret care
funcționează — dacă iese prost, pierzi calendarul; așa, Gmail se adaugă și se testează cu
calendarul neatins.

**Prima verificare, înainte de orice altceva:** trimite pe Telegram „ce am necitit azi?" și
uită-te în `wrangler tail`. Linia trebuie să fie `TOOL_CALL rezumat_inbox (conținut
neînregistrat)`. Dacă vezi corpuri de email în log, oprește-te — logurile Cloudflare nu se mai
pot retrage.

**Verificarea că nu se poate trimite** (de rulat oricând, mai ales după ce cineva atinge
`src/tools/gmail.js`) — trebuie să întoarcă zero rezultate:

```bash
grep -rn "messages/send" src/
```

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

## Aer condiționat prin Alexa (o singură dată + la expirarea logării)

Aerul condiționat (Sinclair, aplicația EWPE Smart) nu are API public. Drumul e:
bot → **API-ul neoficial Alexa** (`src/alexa.js`, același ca alexa.amazon.de /
ioBroker.alexa2) → skill-ul **EWPE Smart Home** → aparat. Gratuit, orice temperatură,
plus citirea stării (pornit, mod, temperatură setată, temperatura din cameră).

Precondiție: în aplicația Alexa, skill-ul **EWPE Smart Home** activat și aparatul descoperit
(în contul curent apare ca „AC").

1. `npm install` (aduce `alexa-remote2`, folosit DOAR de scriptul de logare, nu de Worker).
2. `npm run alexa-login` → deschide **http://localhost:3456/** în browser (exact
   `localhost`, nu `127.0.0.1`) și loghează-te cu contul Amazon al Alexei (+ cod 2FA).
3. Scriptul:
   - pune `ALEXA_REFRESH_TOKEN` direct în Cloudflare (prin stdin — nu apare pe ecran/disc);
   - afișează valorile pentru `wrangler.toml`: `ALEXA_API_HOST` (depinde de regiunea
     contului — contul actual e NA, deci `na-api-alexa.amazon.de`), `ALEXA_DEVICE_APP_NAME`,
     `ALEXA_AC_ENTITY_ID`, `ALEXA_AC_APPLIANCE_ID`. Actualizează-le dacă diferă.
   Alt nume de dispozitiv decât „AC": `ALEXA_AC_NAME="Clima" npm run alexa-login`.
   Doar id-urile, fără să atingi secretul: `npm run alexa-login -- --dry-run`.
4. `npx wrangler deploy`, apoi pe Telegram: „cum e aerul?", „pune 23 de grade pe răcire",
   „oprește aerul la 23:00", „în fiecare zi la 7 pornește încălzirea pe 22".

**Când botul răspunde „Sesiunea Alexa a expirat"**: Amazon a invalidat tokenul (schimbare de
parolă, deconectare dispozitive din cont, schimbări la Amazon). Reia pașii 2–3; nu e nevoie de
redeploy dacă id-urile nu s-au schimbat.

**Securitate:** `ALEXA_REFRESH_TOKEN` = acces la contul Amazon. Stă doar ca Wrangler secret.
Revocare: amazon.com → Account → *Login & security* / *Manage Your Content and Devices →
Devices* → dezînregistrează dispozitivul „ioBroker Alexa2".

## Spotify (o singură dată)

**Ce NU mai merge, și nu din vina codului:** crearea de playlisturi și orice altă SCRIERE. Din
15 mai 2025, Spotify permite scrierea doar aplicațiilor în „Extended Quota", care cere firmă
înregistrată și 250.000 de utilizatori lunari. O aplicație personală primește 403 pe
`POST /users/:id/playlists`, chiar și în contul propriu, chiar și cu Premium. Unealta
`spotify_creeaza_playlist` alege totuși piesele și le întoarce cu linkuri, ca să le adaugi
manual — vezi regula 50b-bis din CLAUDE.md.

Ce merge: **căutarea** și **controlul redării** (pornit/pauză/următoarea/volum) — ultimul cere
Premium și un Spotify deschis undeva.

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app**.
   Nume: orice (ex. „Jarvis"). La **Redirect URI** pune EXACT:

   ```
   https://telegram-assistant.iarisgabor.workers.dev/spotify/callback
   ```

   Bifează **Web API**. Salvează, apoi copiază Client ID și Client Secret.

2. Pune-le ca secrete și fă deploy:

   ```bash
   npx wrangler secret put SPOTIFY_CLIENT_ID
   npx wrangler secret put SPOTIFY_CLIENT_SECRET
   npx wrangler deploy
   ```

3. Deschide în browser (`<VOICE_ACCESS_TOKEN>` e cheia de acces vocal, aceeași care stă în
   `app/android/app/src/main/res/values/token.xml`):

   ```
   https://telegram-assistant.iarisgabor.workers.dev/spotify/auth?token=<VOICE_ACCESS_TOKEN>
   ```

   Apeși **Agree** în pagina Spotify. Atât — refresh token-ul se salvează singur, iar pagina de
   întoarcere îți spune doar că e gata. Nu ai nimic de copiat.

Dacă vrei vreodată să reautorizezi (ai schimbat contul, ai retras accesul din Spotify), reiei
pasul 3; noul token îl înlocuiește pe cel vechi.

**Redarea are nevoie de un Spotify deschis undeva** (telefon, calculator, boxă). Dacă nu e
niciunul, uneltele întorc „niciun dispozitiv activ", iar asistentul îl poate deschide singur
pe telefon (`spotify_deschide_pe_telefon`).

> **Dacă adaugi vreodată un scope nou** în lista din `src/index.js`: scope-urile se fixează în
> clipa autorizării, deci refresh token-ul vechi NU îl va avea niciodată. Trebuie redeschis
> `/spotify/auth?token=...` o dată. Un scope lipsă se vede abia ca un 403 la prima cerere care
> are nevoie de el — de exemplu `user-read-private`, fără care `/me` întoarce răspuns fără
> `product` și `country`, iar un cont Premium arată identic cu unul gratuit.

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

## Apelul vocal (o singură dată)

1. `wrangler secret put GEMINI_API_KEY` — cheia din https://aistudio.google.com/apikey
   (cont gratuit, fără card).
2. `wrangler secret put VOICE_ACCESS_TOKEN` — un șir aleatoriu ales de tine:
   `node -e "console.log(crypto.randomUUID().replace(/-/g,''))"`
3. `npx wrangler deploy`
4. Pe telefon, deschide **o singură dată**: `https://<worker>/voce/?token=<VOICE_ACCESS_TOKEN>`
   Tokenul intră în `localStorage` și dispare din adresă. Apoi „Adaugă pe ecranul principal".

**Schimbarea vocii:** `GEMINI_VOICE_NAME` în `wrangler.toml` (acum `Gacrux`). Se poate proba una
fără deploy, adăugând `&voice=<Nume>` la adresă. **Atenție:** un nume greșit NU dă eroare —
Gemini trece tăcut pe vocea lui implicită, deci pare că schimbarea n-a avut efect.

Verificare că un telefon e pe legătura permanentă:

```bash
curl "https://<worker>/voice-listen/stare?token=<VOICE_ACCESS_TOKEN>"
# {"conectat":true}
```

## Notificări („sună-mă tu")

Cheile VAPID se generează o singură dată:

```bash
node -e "
const { generateKeyPairSync } = require('crypto');
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' }), priv = privateKey.export({ format: 'jwk' });
const b = (s) => Buffer.from(s, 'base64url');
console.log('PUBLICA :', Buffer.concat([Buffer.from([4]), b(pub.x), b(pub.y)]).toString('base64url'));
console.log('PRIVATA :', b(priv.d).toString('base64url'));
"
```

Publica merge în `wrangler.toml` (`VAPID_PUBLIC_KEY`) **și** în `public/voce/app.js`
(constanta `VAPID_PUBLIC_KEY`); privata prin `wrangler secret put VAPID_PRIVATE_KEY`.

Notificările se încearcă în ordinea asta: **legătura permanentă** a aplicației native →
**Web Push** (browser/PWA) → **Telegram**, ca plasă de siguranță. Doar prima poate suna telefonul
ca un apel adevărat; ultima garantează că mesajul nu se pierde.

**Cum verifici semnătura VAPID fără telefon:** trimite spre un endpoint FCM inventat. Un **410**
(„subscription expired") înseamnă că semnătura e bună și doar abonamentul e fals; un **401/403**
înseamnă că semnătura e greșită.

## Apeluri telefonice prin voce („sună-l pe tata")

Nu cere niciun secret și nicio configurare pe server — apelul îl dă telefonul, prin unealta
`suna_pe_telefon`. Cere însă **două permisiuni Android**, pe care aplicația le cere singură la
prima pornire după instalare:

- `CALL_PHONE` — apelul pleacă singur. **Fără ea nu e o eroare:** se deschide tastatura cu
  numărul scris și apeși tu, iar asistentul spune asta explicit, în loc să pretindă că a sunat.
- `READ_CONTACTS` — căutarea numelui în agendă. Căutarea se face **pe telefon**; spre server
  pleacă doar numele rostit, iar înapoi vine doar contactul ales. Fără ea, îi poți da doar numere.

Dacă le-ai refuzat din greșeală: Setări → Aplicații → Jarvis → Permisiuni. Restul asistentului
funcționează întreg fără ele.

## Aplicația Android

Nu are nevoie de Android Studio. Uneltele stau în `D:\android-tools` (**nu** în repo):

```bash
export JAVA_HOME=D:/android-tools/jdk21/jdk-21.0.12.1+1   # Capacitor cere JDK 21, nu 17
export ANDROID_HOME=D:/android-tools/sdk

cd app && npx cap sync android
cd android && ./gradlew.bat assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Licențele Android SDK se acceptă scriind amprentele direct în `sdk/licenses/` — `sdkmanager
--licenses` așteaptă un răspuns interactiv pe care un script nu i-l poate da.

Modelul pentru cuvântul de trezire (~68 MB) **nu e în repo**. Se descarcă o singură dată din
`https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip`, se dezarhivează în
`app/android/app/src/main/assets/model-en/`, și — obligatoriu — i se adaugă un fișier `uuid`:

```bash
node -e "require('fs').writeFileSync('uuid', require('crypto').randomUUID())"
```

Arhivele de desktop nu conțin acel fișier, iar fără el `StorageService.sync` aruncă
`FileNotFoundException` **într-un fir de fundal**: cuvântul de trezire nu pornește niciodată și
nimic nu se vede nicăieri.

**Permisiuni de acordat pe telefon, o singură dată:**

- microfon și notificări — le cere aplicația singură;
- **„Afișare peste alte aplicații"** (Setări → Aplicații → Asistent) — **obligatorie** ca
  „Jarvis" să deschidă aplicația direct. Fără ea primești doar o notificare de apăsat, fiindcă
  Android interzice unui serviciu din fundal să deschidă un ecran.

**Diagnostic** — singura cale care chiar lămurește ce se întâmplă în aplicația nativă. Un
`logcat` nefiltrat e înecat în zgomot de la WebView:

```bash
adb logcat -c
adb logcat -d -s VoiceService:V Capacitor/Plugin:V AndroidRuntime:E
```

## Unelte viitoare (nu sunt construite acum)

- `find_free_slot` — același helper OAuth, folosind `find_calendar_events` (deja construit) ca bază.

**Trimiterea de emailuri nu e pe lista asta, și nu din lipsă de timp.** Jarvis scrie ciorne
(`creeaza_ciorna`), butonul „Trimite" rămâne al omului — vezi regula 61 din `CLAUDE.md`.
`create_reminder` a fost construit între timp, sub altă formă: mementourile automate înainte de
fiecare eveniment din calendar (regula 65) plus `programeaza_apel` pentru cele cerute anume.
