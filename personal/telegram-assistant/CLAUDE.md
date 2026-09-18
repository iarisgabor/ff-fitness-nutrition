# CLAUDE.md — telegram-assistant

Asistent personal cu **trei fețe, un singur creier**:

| Cale | Ce e |
|---|---|
| **Telegram** | bot text, prin webhook. Prima și cea mai veche. |
| **Voce (web)** | PWA la `/voce/` — apel în timp real prin Gemini Live. |
| **Voce (Android)** | aplicație nativă (Capacitor) peste aceeași pagină: fundal, cuvânt de trezire „Jarvis", te poate suna. |

Creierul e Worker-ul: un singur prompt (`src/prompt.js`), un singur set de **23 de unelte**
(`src/tools/index.js`), un singur istoric (Durable Object cu SQLite). Gemini Live e doar urechi
și gură; Claude e cel care gândește pe calea Telegram.

Cont unic: orice mesaj care nu vine de la `ALLOWED_TELEGRAM_USER_ID` e ignorat complet, iar
apelurile vocale cer `VOICE_ACCESS_TOKEN`.

> **Setup operațional (secrete, OAuth Google, Planning Center, webhook, Alexa): `README.md`.**
> Fișierul de față e harta de cod + deciziile care nu se văd din cod.

## Stare

Botul de Telegram și calea vocală **merg în producție**. Aplicația Android e construită și
instalată pe telefonul utilizatorului (Galaxy S23 Ultra), nesemnată pentru magazin (build
`debug`). `HANDOFF-VOCE.md` e documentul de lucru din ziua construirii — **istoric**; ce
contează e aici.

Lucruri neterminate, notate ca atare:
- `src/speech.js` (STT/TTS pentru vocale pe Telegram) e scris dar **nelegat** — `processUpdate`
  filtrează în continuare prin `isPrivateTextMessage`.
- Serviciul nativ nu pornește la bootul telefonului; trebuie deschisă aplicația o dată.
- Loguri de diagnostic rămase: `VOICE_AUDIO_IN`, `VOICE_SETUP`, plus `TOOL_CALL` din
  `tools/index.js` (regula 14).

## Unde te duci

| Cauți | Fișier |
|---|---|
| rutare, webhook, pagini OAuth, rutele `/voice-*` | `src/index.js` |
| agentul (DO): istoric SQL, agendă, push, RPC pentru voce | `src/agent.js` |
| apelul către Claude + bucla de tool-use (doar Telegram) | `src/anthropic.js` |
| system prompt (română, regulile fiecărei unelte) | `src/prompt.js` |
| **înregistrarea uneltelor** (definiții + executori) | `src/tools/index.js` |
| Google Calendar | `src/tools/calendar.js` |
| Planning Center (12 unelte) | `src/tools/planning-center.js` |
| aer condiționat (Alexa) | `src/tools/air-conditioner.js` + `src/alexa.js` |
| notificări: programare + trimitere imediată | `src/tools/notificari.js` |
| Web Push (VAPID, semnare, trimitere) | `src/push.js` |
| **protocol Gemini Live** (setup, scheme, reluare sesiune) | `src/voice/gemini.js` |
| **DO-ul unui apel** (releu audio, unelte, reconectare) | `src/voice/session.js` |
| **legătura permanentă** prin care telefonul poate fi sunat | `src/voice/listen.js` |
| PWA-ul: microfon, redare, reconectare, orb | `public/voce/app.js` |
| orbul (canvas, reacție la voce) | `public/voce/orb.js` |
| captură + reeșantionare la 16 kHz | `public/voce/capture-worklet.js` |
| service worker (coajă offline + push) | `public/voce/sw.js` |
| **aplicația nativă** (Capacitor) | `app/` |
| serviciu de prim-plan, cuvânt de trezire, apel pe blocat | `app/android/.../VoiceService.java` |
| puntea JS ↔ Android | `app/android/.../VoicePlugin.java` |
| binding-uri DO, `[vars]`, migrări | `wrangler.toml` |

## Cele patru capcane care au costat cel mai mult

Toate din aceeași familie: **un mediu nou se comportă altfel decât cel vechi, și eșuează în
tăcere.** Niciuna n-a aruncat vreo eroare care să arate spre cauză.

**1. În Workers, `fetch()` respinge `wss://`.** Conexiunea WebSocket de ieșire se deschide pe
`https://` cu headerul `Upgrade`; headerul face upgrade-ul, nu schema. Documentația Gemini scrie
`wss://` fiindcă presupune `new WebSocket`, care în Workers nu există.

**2. Cadrele binare de WebSocket sunt Blob-uri, în ambele sensuri.**
- *de la Gemini*: `new Uint8Array(blob)` dă **tăcut** un tablou gol → fiecare mesaj arăta ca JSON gol.
- *de la browser*: `data instanceof ArrayBuffer` dă fals → **tot microfonul era aruncat**, iar
  asistentul „nu auzea".

> **Nu scrie niciodată `instanceof ArrayBuffer` pe un cadru de WebSocket în Workers.**
> Folosește `VoiceSession.decodeFrame` / `VoiceSession.toArrayBuffer`.

**3. Adrese relative în aplicația nativă.** Pagina e servită local (`https://localhost`), deci
`/voice-ws` înseamnă „caută pe telefon". Toate adresele către server trec prin `gazdaServer()`
din `app.js`.

**4. Android interzice deschiderea unei aplicații din fundal** (din Android 10). `startActivity`
dintr-un serviciu reușește fără eroare și **nu face nimic**. Singura cale: permisiunea
`SYSTEM_ALERT_WINDOW` („Afișare peste alte aplicații"), altfel doar o notificare cu intenție pe
ecran complet — care se deschide singură **doar pe ecran blocat**.

## Reguli care nu se văd din cod

### Creierul (comune tuturor căilor)

1. **Data/ora NU stă în system prompt** pe calea Telegram — ar invalida prompt caching-ul la
   fiecare minut. Se injectează în mesajul curent, prin `buildDateContext()`. Pe calea vocală
   stă o singură dată în `systemInstruction` (nu există cache de prompt acolo).
2. **Ora din contextul vocal îmbătrânește** pe parcursul apelului. De-aia eroarea
   „ora e în trecut" din `notificari.js` **conține ora curentă** — altfel modelul intră în buclă,
   încercând alte ore, tot greșite, fiindcă nu știe de la ce să plece.
3. **Data injectată nu se salvează în SQL.**
4. **`onRequest` răspunde imediat 200 și pune treaba în coadă** — altfel un timeout Telegram
   declanșează reîncercare și poate crea evenimente duplicate.
5. **Mereu 200 către Telegram**, inclusiv pentru mesaje respinse.
6. **Dedup pe `update_id`** — livrarea Telegram e "at least once".
7. **Agenda zilnică se bootstrapează o singură dată**, printr-un flag în `agent_meta`, nu
   verificând dacă există programarea (cursă la `onStart`). După bootstrap, doar
   `sendDailyAgenda()` își reprogramează următoarea rulare.
8. **Agenda nu trece prin Claude** — listare deterministă din Calendar.
9. **`sendTelegramMessage` nu folosește `parse_mode`** — la primul `<` mesajul ar fi respins
   silențios și botul ar părea mut.
10. **`.trim()` defensiv pe fiecare secret** — un `\n` dintr-un `wrangler secret put` prin `echo`
    strică schimbul de token.
11. **`sanitizeOptionalField` în `calendar.js`** apără de un bug de generare: orice valoare cu
    `<`/`>` în câmpuri opționale e tratată ca goală.
12. **Există DOI „Iaris Gabor" în Planning Center.** Cel real e `person_id` `49625294`.
13. **Credențialele Google Calendar sunt SEPARATE de cele de Gmail** din `../ff-fitness/worker/`.
14. `console.log`-uri marcate „DEBUG temporar" în `tools/index.js` și `anthropic.js`.
15. **Promptul are o secțiune „CE EȘTI, ÎNAINTE DE ORICE UNEALTĂ".** Nu o șterge. Fără ea,
    150 de rânduri de reguli de unelte dresează modelul să caute o sarcină în orice mesaj — dacă
    utilizatorul povestea cum a fost ziua, încerca să-i creeze un eveniment în calendar.

### Aer condiționat

16. **Nu are API — merge prin API-ul NEOFICIAL Alexa.** Investigate și abandonate: cloud-ul Gree
    direct (cod criptat cu packer comercial), Voice Monkey (max 3 declanșatoare gratuite).
17. **Ce expune skill-ul EWPE**: pornit/oprit, COOL/HEAT, temperatură, citire stare. NU:
    ventilator, swing, turbo, sleep, lumină, dry. **Modul și temperatura sunt refuzate cu
    aparatul oprit** — de-aia `applyCommand` pornește întâi.
18. **Două id-uri pentru același aparat**: comenzile cer `entityId` (UUID), citirea stării cere
    `applianceId` (`SKILL_...`). Invers dă `TargetApplianceNotFoundException`.
19. **Contul Amazon e în regiunea NA** deși logarea e pe amazon.de → `na-api-alexa.amazon.de`.
20. **`ALEXA_REFRESH_TOKEN` = acces la contul Amazon.** Nu se loghează niciodată. Sesiunea stă în
    `agent_meta` 24h; la 401 se reface o dată.
21. **Programările de AC se reprogramează singure** în `runScheduledAcCommand`, nu prin cron
    (cron-ul SDK-ului e UTC). Fiecare rulare anunță pe Telegram.
22. `alexa-remote2` e devDependency DOAR pentru scriptul de logare — Worker-ul nu-l importă.

### Voce

23. **Uneltele care programează ceva au nevoie de INSTANȚA agentului**, nu de un stub. Un stub din
    `getAgentByName` n-are nici starea, nici alarmele. De-aia `VoiceSession` cheamă
    `agent.runVoiceTool(...)` prin RPC, iar acolo `this` e instanța reală.
24. **Agentul vocal se ia pe ACELAȘI nume ca în Telegram** (`ALLOWED_TELEGRAM_USER_ID`, egal cu
    `chat.id` în conversație privată) — de-aia istoricul e unul singur, indiferent de canal.
25. **Ce se scrie în căsuța de text a PWA-ului trebuie salvat explicit** în istoric: nu trece prin
    `inputAudioTranscription` (nu e audio). Fără asta, următorul apel ține minte doar răspunsurile.
26. **Sesiunile Live mor singure.** Două cauze, două antidoturi în `buildSetupMessage`:
    `contextWindowCompression` (fereastra de context se umple) și `sessionResumption` (durata
    maximă a unei conexiuni). **Reconectarea are DOUĂ straturi** — în Worker (cade Gemini) și în
    browser (dispare Worker-ul). **Un deploy repornește Worker-ul și taie toate apelurile active.**
27. **Un nume de voce greșit NU dă eroare** — Gemini trece tăcut pe vocea lui implicită. Verificat
    cu un nume inventat. Dacă vocea „nu s-a schimbat", prima suspectă e o greșeală de tipar în
    `GEMINI_VOICE_NAME`. Cele 30 acceptate sunt testate; acum e **Gacrux**.
28. **Nu verifica ce voce e activă dintr-o singură mostră** — estimarea înălțimii variază ±20 Hz
    între generări. Compară mai multe, sau cere o voce depărtată ca înălțime.
29. **Cheia Gemini călătorește în query string**, deci apare în mesajul oricărei erori de rețea.
    Tot ce se loghează în `src/voice/` trece prin `redactKey()`.
30. **Notificările push se trimit FĂRĂ conținut**, deliberat: textul ar trebui criptat
    end-to-end (RFC 8291), cod dens și ușor de greșit tăcut. Service worker-ul cere textul de la
    `/voice-push/pending`. **Cum verifici semnătura VAPID fără telefon:** trimite spre un endpoint
    FCM inventat — **410** înseamnă semnătură bună, **401/403** înseamnă semnătură greșită.
31. **`badge` (iconița din bara de stare) trebuie să fie albă pe transparent.** Android păstrează
    doar canalul alfa; o imagine cu fundal iese ca un pătrat. E alt desen, nu logo-ul micșorat —
    la 24px gradațiile și inelele subțiri dispar complet.
32. **În `playChunk`, sursele audio se conectează la `botAnalyser`, nu la `destination`.** Dacă
    cineva rescrie linia înapoi, orbul amuțește exact când vorbește asistentul — regresie mută.
33. **Contextul audio de redare se creează înainte de orice `await`**, deci încă în gestul de
    apăsare. Creat după `getUserMedia`, pornește „suspended" pe iOS și pe unele Android-uri, iar
    tot ce programezi se pierde fără eroare.
34. **`new AudioContext({ sampleRate: 16000 })` e o SUGESTIE.** Dacă browserul o ignoră (Safari,
    unele Android), s-ar trimite 48 kHz etichetat ca 16 kHz — voce groasă, întinsă de trei ori,
    pe care Gemini n-o înțelege. `capture-worklet.js` citește rata reală și reeșantionează el.

### Aplicația nativă

35. **Serviciul are TREI stări, nu două acțiuni** (`ACTION_VEGHE` / `ACTION_APEL` /
    `ACTION_STOP`). Într-un apel, microfonul e al WebView-ului, deci **cuvântul de trezire
    TREBUIE oprit** — două capturi simultane în același proces nu merg, una primește liniște și
    nu se știe dinainte care.
36. **Închiderea apelului NU oprește serviciul** — se întoarce în veghe. Altfel „Jarvis" ar
    funcționa o singură dată, până la primul apel. Oprirea completă e butonul din notificare.
37. **Apelul se închide singur după 3 minute de liniște** (`LINISTE_MAXIMA_MS`). Nu e o
    comoditate: Gemini se plătește la minut, iar un apel uitat deschis în fundal ține și
    microfonul ocupat, deci și trezirea oprită.
38. **`onNewIntent` trebuie să cheme `setIntent()`.** Activitatea e `singleTask`; fără asta
    `getIntent()` întoarce mereu intenția inițială, iar steagul „am fost chemată de Jarvis" nu
    ajunge la pagină: aplicația se deschide, dar apelul nu pornește.
39. **Modelul Vosk are nevoie de un fișier `uuid`** în folderul lui. Arhivele de desktop de pe
    alphacephei **nu îl conțin**; fără el `StorageService.sync` aruncă `FileNotFoundException`
    într-un fir de fundal și cuvântul de trezire nu pornește niciodată, fără niciun semn.
40. **Vosk NU are model românesc** (verificat pe lista lor completă) — de-aia cuvântul de trezire
    e „Jarvis", englezesc. Conversația rămâne în română. Recunoașterea e restrânsă prin gramatică
    la un singur cuvânt: de zeci de ori mai puțin procesor decât un dicționar întreg.
41. **Despachetarea modelului e asincronă** — paza `trezireInCurs`, nu `speechService != null`.
    La a doua comandă apropiată, prima încă nu l-a creat, și porneau două motoare.
42. **Cheia de acces stă în `res/values/token.xml`, nu în `public/voce/`.** Folderul acela e
    servit public pe internet; o cheie pusă acolo ar fi citibilă de oricine. Fișierul e gitignorat.
43. **Notificarea permanentă nu e o scăpare, e contractul Android**: microfonul poate rămâne
    deschis în fundal doar dacă aplicația arată vizibil că o face.

## Cum adaugi o unealtă nouă

O intrare în `TOOL_DEFINITIONS` + un handler în `EXECUTORS` (`src/tools/index.js`), plus regulile
ei în `src/prompt.js`. **`anthropic.js`, `agent.js` și calea vocală nu se modifică** — ăsta e
seam-ul; unealta apare automat și în voce.

Excepții:
- o unealtă care **programează** ceva primește agentul ca al treilea argument și are nevoie de o
  metodă-callback pe `AssistantAgent` (`runScheduledAirConditioner`, `runScheduledNotification`);
- schema trebuie să treacă prin `toGeminiSchema` — Gemini acceptă doar subsetul OpenAPI. Tipuri
  reunite (`type: ['number','null']`) devin `nullable: true`; uneltele fără parametri se trimit
  fără `parameters` deloc.

## Comenzi

```bash
# Worker
npm install
npx wrangler deploy
npx wrangler tail                  # loguri live: VOICE_*, TOOL_CALL, PUSH_*
npx wrangler secret put NUME
npm run alexa-login                # (re)logare Alexa

# Aplicația Android (are nevoie de JDK 21 + Android SDK, vezi mai jos)
cd app && npx cap sync android
cd app/android && ./gradlew.bat assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Uneltele Android sunt în `D:\android-tools` (nu în repo): JDK 21 în `jdk21/`, SDK în `sdk/`.
Înainte de build: `JAVA_HOME` spre JDK **21** (Capacitor cere 21, nu 17 — „invalid source
release: 21"), `ANDROID_HOME` spre `sdk`.

Diagnostic pe telefon — **singura cale care chiar lămurește** ce se întâmplă în aplicația nativă:

```bash
adb logcat -c
adb logcat -d -s VoiceService:V Capacitor/Plugin:V AndroidRuntime:E
```

(Filtrează pe etichete. Un `logcat` nefiltrat e înecat în zgomot de la WebView.)

Verificări rapide pe server:

```bash
# e telefonul pe legătura permanentă?
curl "https://telegram-assistant.iarisgabor.workers.dev/voice-listen/stare?token=<VOICE_ACCESS_TOKEN>"
```

## Config și secrete

`[vars]` în `wrangler.toml`: `DEFAULT_TIMEZONE`, `GOOGLE_CALENDAR_ID`, `DAILY_AGENDA_HOUR`,
`ALEXA_*` (5), `GEMINI_LIVE_MODEL`, `GEMINI_VOICE_LANGUAGE`, `GEMINI_VOICE_NAME`,
`GEMINI_MODALITIES_IN_SETUP`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `TWA_PACKAGE_ID`,
`TWA_FINGERPRINT`.

Secrete (`wrangler secret put`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`ANTHROPIC_API_KEY`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`,
`GOOGLE_CALENDAR_REFRESH_TOKEN`, `ALLOWED_TELEGRAM_USER_ID`, `INTERNAL_ADMIN_SECRET`,
`PLANNING_CENTER_APP_ID`, `PLANNING_CENTER_SECRET`, `ALEXA_REFRESH_TOKEN`, `GEMINI_API_KEY`,
`VOICE_ACCESS_TOKEN`, `VAPID_PRIVATE_KEY`.

Durable Objects: `ASSISTANT_AGENT` (agentul, unul per utilizator), `VOICE_SESSION` (unul per
apel, id unic), `LISTEN_SESSION` (unul per utilizator, **hibernabil** — stă deschis zile întregi
și transportă câțiva octeți).

## Modele

- **Claude Sonnet 5** (`src/anthropic.js`) pentru calea Telegram — apelat direct prin `fetch()`,
  fără SDK, cu bucla de tool-use scrisă manual (max 8 iterații, tool-use paralel).
- **Gemini Live** (`GEMINI_LIVE_MODEL`) pentru voce — nativ pe audio, full-duplex. Ales pe cost:
  ~3 $/lună la ~150 min, față de ~12 $ la ElevenLabs Agents.
