> **ISTORIC — nu mai e documentul de referință.**
>
> Tot ce contează din el a fost mutat în `CLAUDE.md` (regulile, capcanele, arhitectura) și în
> `README.md` (pașii de setup). Acolo se caută, acolo se actualizează.
>
> Ce rămâne aici și nu e nicăieri altundeva: **de ce** s-a ales Gemini Live și nu altceva, și
> de ce varianta „aplicația Claude sau ChatGPT cu uneltele tale" nu se poate. Dacă cineva
> redeschide acele discuții, răspunsul e mai jos — cu cifre și surse.
>
> Se poate șterge fără pierdere, odată ce deciziile astea nu mai sunt puse la îndoială.

---
# Predare — asistent vocal peste `telegram-assistant`

> Document de continuare, scris 17 septembrie 2026. Scopul lui: o sesiune nouă poate relua lucrul
> fără să refacă research-ul (~25 de căutări) și fără să redeschidă decizii deja luate.
> **Citește-l întreg înainte să scrii cod.** Se șterge când proiectul e gata.

## Ce se construiește

Un mod de a vorbi cu asistentul personal existent (`personal/telegram-assistant/`) **prin voce**,
cu **toate cele 21 de unelte** funcționale — calendar, Planning Center, aer condiționat.
Utilizatorul vorbește română.

Forma aleasă: **un PWA cu buton de apel** (pagină web instalată pe ecranul principal al
telefonului), conversație în timp real prin **Gemini Live API**, cu Worker-ul existent ca
creier și executor de unelte.

## Decizii luate — NU le redeschide

### De ce nu aplicația Claude sau ChatGPT

Utilizatorul a cerut explicit varianta asta întâi. **Nu se poate, la niciunul din cei doi vendori:**

- **Custom GPT Actions nu rulează în voice mode** — la fel ca generarea de imagini și Code
  Interpreter, sunt dezactivate acolo.
- **Serverele MCP proprii nu rulează în voice mode**, nici la ChatGPT („voice mode does not
  support apps"), nici la Claude (reproductibil pe web și Android, nedocumentat ca intenție).
- În voce supraviețuiesc **doar conectorii nativi** ai vendorului (Gmail, Google Calendar, Docs,
  Slack). Toate uneltele custom cad.
- Motivul e structural: voice mode e alt model, nativ pe voce, full-duplex, cu propriul set
  restrâns de unelte — nu modelul de text cu microfon în față.
- **Claude voice mode nu suportă română** (11 limbi: EN, FR, DE, HI, ID, IT, JA, KO, PT-BR,
  ES-419, ES-ES). Dictarea din Claude Code: 18 limbi, tot fără română.

Concluzie deja comunicată utilizatorului: capabilitatea „voce + uneltele tale" **există**, dar
numai prin API (Gemini Live, OpenAI Realtime `gpt-live-1`, ElevenLabs Agents), nu în aplicațiile
de consum.

### De ce Gemini Live și nu altceva

Cost, la ~150 min/lună de folosire personală:

| Variantă | Cost lunar |
|---|---|
| **Gemini Live** ($0.005/min in, $0.018/min out) | **~$3**, sau $0 pe tier-ul gratuit |
| ElevenLabs Agents ($0.08/min) | ~$12 + LLM + telefonie |
| Vapi ($0.05/min taxă proprie + furnizorii tăi) | variabil, peste Gemini |

Google AI Studio are **tier gratuit permanent, fără card** (Flash/Flash-Lite, ~10-15 RPM,
250-1000 cereri/zi) — pentru un singur utilizator, cotele nu se ating practic niciodată.
Gemini Live suportă **function calling**, deci uneltele merg.

Despre Vapi există cifre contradictorii (o sursă: 1.000 min gratuite/lună; alta: 60 min + $10
credit, fără tier gratuit continuu). **Nu construi pe promisiunea asta fără verificare directă.**

### De ce fără număr de telefon

Numărul (DID) e singurul cost fix — Twilio ~$1.15/lună + $0.0085/min la intrare. Un PWA cu buton
de apel prin WebRTC/WebSocket se simte la fel, **fără operator, fără abonament, fără minute de
telefonie**. Se adaugă mai târziu peste aceeași infrastructură dacă utilizatorul vrea să sune de
pe ecranul de blocare, din mașină — nu se rescrie nimic, e doar altă intrare spre același agent.

### „Să mă sune el"

SDK-ul `agents` (deja dependență în `package.json`) are **push notifications native, Web Push +
VAPID**. Worker-ul sună telefonul cu o notificare, utilizatorul apasă, se deschide conversația.
Zero cost de telefonie. Asta înlocuiește eventual agenda zilnică de la 20:00 ca text pe Telegram.

## Arhitectura

```
PWA (mic + difuzor)  ──WS──►  VoiceSession (DO)  ──WS──►  Gemini Live
                                     │
                                     └── RPC ──► AssistantAgent (DO existent)
                                                  └── executeTool() → cele 21 de unelte
```

**Principiul care nu se încalcă: Worker-ul rămâne creierul.** Gemini Live e doar urechi și gură.
Nu se duplică prompt-ul, nu se duplică uneltele, nu apare o a doua sursă de adevăr.

Se refolosesc ca atare:
- `buildSystemPrompt(env)` din `src/prompt.js` → `systemInstruction` în setup-ul Gemini
- `TOOL_DEFINITIONS` din `src/tools/index.js` → `functionDeclarations`
- `executeTool(env, name, input, agent)` → executorul apelurilor de funcție

### Capcana de care depinde corectitudinea

Uneltele de aer condiționat cheamă `agent.schedule()`, `agent.listSchedules()`,
`agent.cancelSchedule()` (vezi `src/tools/air-conditioner.js:228,252,265,292,296`). Astea sunt
metode pe **instanța** Durable Object — în calea Telegram, `agent` e `this`.

Un stub obținut cu `getAgentByName` **nu e instanța**. Deci nu pasa stub-ul direct în
`executeTool`. Soluția decisă:

> Adaugă pe `AssistantAgent` o metodă `async runVoiceTool(name, input)` care face
> `return executeTool(this.env, name, input, this)`. `VoiceSession` o cheamă prin RPC pe stub.
> Astfel programările de AC făcute prin voce rulează și notifică exact ca cele din Telegram,
> pe aceeași instanță, cu aceeași stare.

## Ce e deja scris pe disc

Ambele fișiere sunt **complete și necesare indiferent de restul** — sunt canalul de rezervă
(vocale în Telegram), util când nu vrei un apel întreg:

- **`src/speech.js`** (nou) — STT + TTS, agnostic de canal. ElevenLabs Scribe dacă există
  `ELEVENLABS_API_KEY` (3.1% WER pe română, față de ~12% la Whisper — contează, se dictează nume
  proprii), altfel Workers AI `@cf/openai/whisper-large-v3-turbo` (base64, acceptă ogg, nu cere
  cont nou). TTS doar cu ElevenLabs; fără cheie, răspunsul rămâne text.
- **`src/telegram.js`** (modificat) — adăugate `isPrivateVoiceMessage`, `getVoicePayload`,
  `downloadTelegramFile` (getFile + download de pe host-ul de fișiere, care e diferit de cel de
  API), `sendChatAction`, `sendTelegramVoice`.

Niciunul din cele două nu e încă legat în `processUpdate` — vezi pasul 9 de mai jos.

`package.json` rămâne neatins (nicio dependență nouă). `src/agent.js`, `src/index.js` și
`wrangler.toml` au fost modificate pentru calea vocală — vezi pașii 3, 4 și 6.

## Ce urmează, în ordine

Pașii 1-6 sunt **scriși și verificați la build** (17 septembrie 2026, `wrangler deploy
--dry-run` trece, toate fișierele parsează). **Nimic nu e încă deployat sau testat live** —
lipsesc secretele. Ce s-a scris:

1. ✅ **`src/voice/gemini.js`** — URL, mesajul de setup, `TOOL_DEFINITIONS` →
   `functionDeclarations`. Filtrare pe **listă albă** de chei de schemă (nu doar scoaterea lui
   `additionalProperties`), ca o unealtă nouă să nu strecoare altă cheie respinsă de Gemini.
   **Capcană găsită la conversie:** `schedule_air_conditioner.temperature` are
   `type: ['number', 'null']` — Anthropic acceptă tipuri reunite, Gemini nu; se convertește în
   `type: 'NUMBER', nullable: true`. Tipurile se scriu cu MAJUSCULE (`OBJECT`, `STRING`), iar
   uneltele fără parametri (3 din 21) se trimit fără `parameters` deloc, fiindcă un OBJECT gol
   e respins.
2. ✅ **`src/voice/session.js`** — DO `VoiceSession`, releu în ambele sensuri. Spre Gemini:
   base64 (cerut de protocol). Spre browser: **PCM brut binar**, fără base64.
3. ✅ **`src/agent.js`** — `runVoiceTool(name, input)` (rulează `executeTool` cu `this`, instanța
   reală) + `saveVoiceTranscript(role, text)`, care scrie în același tabel `messages` ca
   Telegram. Agentul e luat pe **același nume** ca în Telegram (`ALLOWED_TELEGRAM_USER_ID`, egal
   cu `chat.id` într-o conversație privată), deci istoricul vocal și cel scris sunt un singur fir.
4. ✅ **`src/index.js`** — rută `/voice-ws`, token prin query string (un WebSocket din browser nu
   poate purta headere), **id unic de DO per apel** ca două apeluri simultane să nu se calce.
5. ✅ **`public/voce/`** — `index.html`, `app.js`, `orb.js`, `capture-worklet.js`, `sw.js`,
   `manifest.webmanifest`, `icon.svg`, `icon-maskable.svg`. Două contexte audio: unul cerut la
   16 kHz pentru microfon, altul la 24 kHz pentru redare. **Reeșantionarea o face worklet-ul**,
   nu browserul — vezi capcana din 7b. Are și câmp de text ca rezervă (`clientContent`),
   răspunsul vine tot vocal.

   **`orb.js`** (18 septembrie 2026) — cercul care respiră pe tot fundalul, desenat în canvas.
   Ascultă **două** `AnalyserNode`-uri separate: microfonul (ramură laterală pe `micContext`,
   nu schimbă ce se trimite) și redarea (intercalat ÎNTRE sursele audio și difuzor — `playChunk`
   conectează la `botAnalyser`, nu la `destination`; dacă cineva rescrie linia aia înapoi la
   `destination`, orbul amuțește exact când vorbește asistentul). Albastru când vorbești tu,
   verde când vorbește el, la suprapunere virează spre cine e mai tare. Canvas și nu CSS fiindcă
   forma se recalculează din eșantioane audio la fiecare cadru — o animație CSS are o curbă fixă
   și n-ar putea urmări vocea. Panoul de transcriere se ascunde din butonul „Transcriere", iar
   alegerea se ține în `localStorage` (`voce.panou`).
6. ✅ **`wrangler.toml`** — binding + migrare `v2` pentru `VoiceSession`, `[assets]`,
   `GEMINI_LIVE_MODEL` / `GEMINI_VOICE_LANGUAGE` / `GEMINI_VOICE_NAME` /
   `GEMINI_MODALITIES_IN_SETUP`.
7. ✅ **Secrete puse** (`GEMINI_API_KEY`, `VOICE_ACCESS_TOKEN`) și **deployat**.

   **Verificat live, 17 septembrie 2026, fără microfon** (client WebSocket din Node, cu
   `{type:'text'}` în loc de audio): `setupComplete` primit → modelul
   `models/gemini-3.8-live` e valid, `responseModalities` în `generationConfig` e ACCEPTAT
   (deci `GEMINI_MODALITIES_IN_SETUP` rămâne "0"), toate cele 21 de `functionDeclarations`
   trec de validarea de schemă. Modelul a răspuns în română, a chemat `find_calendar_events`
   prin `runVoiceTool`, a primit răspunsul din Google Calendar-ul real și l-a rostit —
   236 KB de PCM la 24 kHz, ~5 secunde de vorbire. Poarta: fără token 401, token greșit 401,
   token corect 101.

   **Două capcane care au costat câte un deploy fiecare:**
   - **Schema e `https://`, nu `wss://`.** În Workers conexiunea de ieșire se deschide cu
     `fetch()` + header `Upgrade`, iar `fetch` respinge din start `wss://`
     („Fetch API cannot load"). Documentația Gemini scrie `wss://` fiindcă presupune
     constructorul `new WebSocket`, care în Workers nu există.
   - **Cadrele binare de pe WebSocket sunt Blob-uri, în AMBELE sensuri.** Confirmat prin log:
     `VOICE_AUDIO_IN 1 tip=Blob`. A costat două diagnosticări separate, fiindcă se manifestă
     complet diferit:
     - *de la Gemini*: `new Uint8Array(blob)` dă **tăcut** un tablou gol, deci fiecare mesaj
       arăta ca un JSON gol, fără niciun indiciu;
     - *de la browser*: `data instanceof ArrayBuffer` dă fals, deci **fiecare bloc de microfon
       era aruncat în tăcere** — asistentul „nu auzea", fără nicio eroare nicăieri.

     De-aia există `VoiceSession.decodeFrame` (Gemini → text) și `VoiceSession.toArrayBuffer`
     (browser → audio), amândouă acoperind string / ArrayBuffer / ArrayBufferView / Blob.
     **Nu scrie niciodată `instanceof ArrayBuffer` pe un cadru de WebSocket în Workers.**
     Logurile `VOICE_GEMINI_BAD_JSON` și `VOICE_CLIENT_FRAME_NEDECODAT` scriu tipul cadrului
     tocmai ca următoarea variantă să se vadă imediat.

   **Și o scurgere, reparată:** cheia Gemini merge în query string (așa cere API-ul), deci
   apare în mesajul oricărei erori de rețea — primul `console.error(err.stack)` a scris-o
   întreagă în logurile Cloudflare. Acum tot ce se loghează trece prin `redactKey()` din
   `gemini.js`. **Cheia expusă atunci a fost regenerată.** Dacă adaugi loguri noi în
   `src/voice/`, treci-le prin `redactKey`.

7b. ✅ **Merge pe telefon** (18 septembrie 2026): microfon → transcriere → unelte → voce înapoi.
   Două capcane reparate pe partea de browser, ambele mute, niciuna cu vreo eroare:
   - **Contextul audio de redare trebuie creat înainte de orice `await`**, deci încă în
     interiorul gestului de apăsare. Creat după `getUserMedia`, pornește „suspended" pe iOS și
     pe unele Android-uri, iar tot ce programezi în el se pierde. Are și `resume()` explicit,
     plus un bloc de tăcere care deblochează ieșirea pe iOS.
   - **`new AudioContext({ sampleRate: 16000 })` e doar o SUGESTIE.** Safari/iOS o ignoră și dă
     rata hardware-ului (48 kHz) — am fi trimis 48 kHz etichetat ca 16 kHz, adică o voce groasă
     și întinsă de trei ori, pe care Gemini n-o înțelege. `capture-worklet.js` citește rata
     reală (globala `sampleRate`) și reeșantionează el, cu interpolare liniară.

   Pagina are un **rând de diagnostic** sub status (`mic 48000→16000 Hz · redare running ·
   N blocuri primite`) — pe telefon nu există consolă, iar „nu aud nimic" are trei cauze
   diferite pe care rândul ăla le separă dintr-o privire.

   **Loguri de diagnostic rămase în `src/voice/session.js`:** `VOICE_AUDIO_IN` (primul bloc și
   apoi din 50 în 50) și `VOICE_SETUP` (vocea cerută vs cea din env, la fiecare apel). De scos
   când se închide diagnosticarea, ca `console.log`-urile marcate „DEBUG temporar" din
   `tools/index.js` (regula 14 din `CLAUDE.md`).

7c. ✅ **Vocea.** `GEMINI_VOICE_NAME` în `wrangler.toml`; din 18 septembrie 2026 e **Gacrux**
   (cerută: cea mai apropiată de JARVIS). Se poate testa una fără deploy, cu `&voice=<Nume>`
   pe `/voce/` — `VoiceSession` citește parametrul din URL și îl trece în setup doar pentru
   sesiunea aia.

   **Capcană: un nume de voce greșit NU dă eroare.** Gemini trece tăcut pe vocea lui implicită.
   Verificat cu un nume inventat (`NuVaExista`) — a produs audio normal. Deci o greșeală de
   tipar în `GEMINI_VOICE_NAME` se manifestă doar ca „parcă nu s-a schimbat vocea".

   Cele 30 de voci acceptate, testate una câte una pe API-ul real: Achernar, Achird, Aoede,
   Algenib, Algieba, Alnilam, Autonoe, Callirrhoe, Charon, Despina, Enceladus, Erinome, Fenrir,
   Gacrux, Iapetus, Kore, Laomedeia, Leda, Orus, Pulcherrima, Puck, Rasalgethi, Sadachbia,
   Sadaltager, Schedar, Sulafat, Umbriel, Vindemiatrix, Zephyr, Zubenelgenubi.

   **Dacă vreodată verifici ce voce e activă, nu te lua după o singură mostră.** Estimarea
   înălțimii dintr-un fișier variază ±20 Hz de la o generare la alta — destul cât să pară că
   deploy-ul n-a prins. Compară mai multe mostre, sau cere o voce foarte depărtată ca înălțime
   (ex. Zephyr ~200 Hz vs Gacrux ~110 Hz), unde diferența depășește zgomotul.

7d. ✅ **Sesiuni lungi** (18 septembrie 2026). Se închideau singure după 3-5 minute.
   Două cauze la Gemini, cu antidot fiecare: fereastra de context plină
   (`contextWindowCompression` cu fereastră glisantă) și durata maximă a unei conexiuni
   (`sessionResumption` — handle-ul primit periodic continuă conversația pe o conexiune nouă).

   **Reconectarea are DOUĂ straturi, și sunt amândouă necesare:**
   - *în Worker* (`reconecteaza()` din session.js) — reface legătura cu Gemini fără ca browserul
     să afle; socketul spre telefon rămâne deschis, microfonul curge în `pendingAudio`, nimic nu
     se pierde;
   - *în browser* (`reconecteazaClient()` din app.js) — acoperă ce Worker-ul nu poate acoperi
     singur: propria dispariție. **Un deploy repornește Worker-ul și taie toate apelurile
     active** — asta a și invalidat două rulări de test până să-mi dau seama.

   **Test de 13 minute, trecut:** o singură cădere (provocată de un deploy al meu), refăcută
   automat în 6 secunde, iar la minutul 12 încă răspundea. **Cauza rădăcină a căderilor de la
   2,6 și 4,8 minute n-a fost găsită** — logurile nu arată nimic, sesiunea din Worker dispare
   pur și simplu. Sistemul își revine singur, dar problema e mascată, nu explicată. Dacă revine,
   acolo trebuie săpat.

7e. ✅ **Notificări push** (18 septembrie 2026) — asistentul îl poate căuta el pe utilizator.
   Unelte noi: `programeaza_apel` (la o oră viitoare, o dată sau zilnic) și `trimite_notificare`
   (acum). Total unelte: **23**.

   **Notificările se trimit FĂRĂ conținut, deliberat.** Standardul permite și text, dar atunci
   trebuie criptat end-to-end (RFC 8291: ECDH + HKDF + AES-GCM) — cod dens, ușor de greșit
   într-un fel care eșuează tăcut. Așa e nevoie doar de o semnătură VAPID, iar service worker-ul
   cere textul de la `/voice-push/pending` când primește semnalul. Un drum în plus la livrare,
   în schimbul unei bucăți de criptografie nefalsificabilă.

   **Cum verifici semnătura VAPID fără telefon:** trimite spre un endpoint FCM inventat. Dacă
   Google răspunde **410** („subscription expired"), semnătura e bună și doar abonamentul e
   fals. Un **401/403** ar însemna că semnătura e greșită. Verificat: 410.

   Chei: `VAPID_PUBLIC_KEY` + `VAPID_SUBJECT` în `wrangler.toml`, `VAPID_PRIVATE_KEY` ca secret.
   Textul în așteptare stă în `agent_meta` (cheia `push_pending`) și se consumă la citire; dacă
   telefonul nu poate fi notificat, mesajul pleacă pe Telegram în loc să se piardă.

7f. ✅ **APK** (18 septembrie 2026) — TWA generat cu PWABuilder, pachet
   `dev.workers.iarisgabor.asistent`. `/.well-known/assetlinks.json` e servit **din Worker**, nu
   ca fișier static (căile care încep cu punct pot fi tratate special de serverul de fișiere).
   Amprenta în `TWA_FINGERPRINT`. Keystore-ul e la utilizator — fără el nu se mai pot publica
   actualizări peste aplicație.

   **Ce NU poate învelișul web**, verificat despachetând APK-ul: n-are `RECORD_AUDIO` (microfonul
   rulează în procesul Chrome, de-aia moare când ieși din aplicație) și n-are
   `FOREGROUND_SERVICE`. Deci fundal, apel pe ecranul de blocare și cuvânt de trezire cer
   Capacitor. **Are** însă `POST_NOTIFICATIONS` și `DelegationService`, deci push-ul merge fără
   reconstruirea APK-ului.

8. ⬜ **Ce a mai rămas de probat: o programare de aer condiționat prin voce.** E singura care
   dovedește că `runVoiceTool` rulează pe **instanța** corectă a DO-ului, nu pe un stub —
   calendarul nu atinge `this.schedule()`, deci nu demonstrează asta. Reușita se vede complet
   abia când sosește și notificarea pe Telegram, la ora programată.

   Acces pe telefon: se deschide o singură dată
   `https://<worker>/voce/?token=<VOICE_ACCESS_TOKEN>` (tokenul intră în `localStorage` și
   dispare din adresă), apoi „Adaugă pe ecranul principal".
9. ⬜ **Neconectat încă: vocalele din Telegram.** `src/speech.js` și helperii noi din
   `src/telegram.js` sunt scriși și compilează, dar **nu-i cheamă nimeni** — `processUpdate`
   filtrează în continuare prin `isPrivateTextMessage`. E o decizie deschisă, nu o scăpare:
   apelul din PWA acoperă același nevoi. De legat doar dacă utilizatorul vrea și varianta
   „trimit un vocal pe Telegram, primesc un vocal înapoi".
10. ⬜ **`CLAUDE.md` + `README.md`** ale proiectului — de actualizat după ce apelul merge live.

## Protocol Gemini Live — verificat în documentație

Endpoint:
```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={API_KEY}
```

Setup (primul mesaj; așteaptă `setupComplete` înainte de orice altceva):
```json
{ "setup": {
    "model": "models/gemini-3.8-live",
    "responseModalities": ["AUDIO"],
    "systemInstruction": { "parts": [{ "text": "..." }] },
    "tools": [{ "functionDeclarations": [ ... ] }]
} }
```

Audio spre model — **PCM brut 16-bit, 16 kHz, little-endian**, base64:
```json
{ "realtimeInput": { "audio": { "data": "<base64>", "mimeType": "audio/pcm;rate=16000" } } }
```

Audio de la model — **PCM brut 16-bit, 24 kHz**:
```json
{ "serverContent": { "modelTurn": { "parts": [{ "inlineData": { "data": "<base64>" } }] } } }
```

Apel de funcție și răspuns:
```json
{ "toolCall": { "functionCalls": [{ "id": "...", "name": "...", "args": {} }] } }
{ "toolResponse": { "functionResponses": [{ "id": "...", "result": {} }] } }
```

Fiecare mesaj de la client are **exact una** din cheile `setup`, `clientContent`,
`realtimeInput`, `toolResponse`. Răspunsul la un apel de funcție se trimite prin `toolResponse`,
**nu** prin `clientContent`.

Utile în `setup`: `inputAudioTranscription` și `outputAudioTranscription` — dau transcrierea
ambelor sensuri, deci conversația vocală poate ajunge în același istoric SQL ca Telegram.

### Ce nu e verificat — testează întâi

- **`responseModalities` la nivel de `setup` vs în `generationConfig`.** Exemplul din
  „get started with WebSockets" îl pune direct sub `setup`; referința de schemă sugerează
  `generationConfig`. Dacă API-ul îl respinge, mută-l.
- **ID-ul modelului.** `models/gemini-3.8-live` vine din exemplul oficial; ține-l într-o variabilă
  din `wrangler.toml`, nu hardcodat.
- **Cotele tier-ului gratuit pentru Live API specific** — limitele găsite (10-15 RPM, 250-1000
  RPD) sunt pentru modelele Flash în general, nu confirmate separat pentru Live.

## Ce NU se schimbă

- **Botul de Telegram rămâne.** E singurul canal care poate primi push inițiat de server —
  agenda zilnică de la 20:00 stă acolo până se implementează Web Push în PWA.
- `personal/telegram-assistant/CLAUDE.md` și `README.md` trebuie actualizate la final.
- Secretele: doar prin `wrangler secret put`, niciodată în fișiere commise (vezi convenția din
  `CLAUDE.md`-ul de la rădăcina repo-ului).

## Detalii de context despre utilizator

- Vorbește română; tot asistentul e în română, inclusiv `prompt.js`.
- Ține la costuri — a cerut explicit „cea mai ieftină, gratis, preferabil".
- A fost dus prin mai multe variante înainte de asta; **nu relua comparația de opțiuni**, decizia
  e luată. Dacă ceva din plan se dovedește imposibil, spune-i direct și propune o singură
  alternativă, nu un tabel.
- Conectorul Google Calendar de pe contul lui claude.ai arată spre `jarixon.setter@gmail.com`.
  Nu e confirmat că e același cont cu `GOOGLE_CALENDAR_REFRESH_TOKEN` al botului. **Dacă devine
  relevant, testul e:** creează un eveniment din bot, apoi caută-l din cealaltă parte.
