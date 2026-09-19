# CLAUDE.md — telegram-assistant

Asistent personal cu **trei fețe, un singur creier**:

| Cale | Ce e |
|---|---|
| **Telegram** | bot text, prin webhook. Prima și cea mai veche. |
| **Voce (web)** | PWA la `/voce/` — apel în timp real prin Gemini Live. |
| **Voce (Android)** | aplicație nativă (Capacitor) peste aceeași pagină: fundal, cuvânt de trezire „Jarvis", te poate suna. |

Se numește **Jarvis** — în prompt, în interfață, pe ecranul telefonului și ca nume al aplicației
(a fost „Asistent" până pe 18 septembrie 2026). „Jarvis" era oricum deja cuvântul de trezire.

Creierul e Worker-ul: un singur prompt (`src/prompt.js`), un singur set de **41 de unelte**
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
  filtrează în continuare prin `isPrivateTextMessage`. Scos din plan pe 19 septembrie 2026, la
  cererea utilizatorului; codul rămâne, nelegat.
- **Gmail e scris, dar nu merge până nu se fac pașii din Google Cloud** (activare Gmail API,
  scope-uri, refresh token nou) — vezi README. Până atunci, uneltele răspund cu
  `GMAIL_NOT_CONFIGURED`.
- Serviciul nativ nu pornește la bootul telefonului — **și rămâne așa, deliberat** (regula 64).
  Nu e un TODO.
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
| căutare pe internet (web search, prin Anthropic) | `src/tools/cautare-web.js` |
| WhatsApp: uneltele (citit + trimis) | `src/tools/whatsapp.js` |
| Spotify (redare, control, playlisturi) | `src/tools/spotify.js` |
| WhatsApp: citirea notificărilor, pe telefon | `app/android/.../WhatsAppListener.java` |
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
    Din 19 septembrie 2026, Gmail-ul din **acest** repo (`src/tools/gmail.js`) are la rândul lui
    secrete proprii, `GMAIL_*`, cu refresh token distinct de cel de Calendar — nu e doar
    consecvență: `getGoogleCalendarAccessToken` își golește cache-ul la 401/403, deci un 403 de
    Gmail (API neactivat, scope neacordat) ar doborî și calendarul dacă ar împărți un token.
14. `console.log`-uri marcate „DEBUG temporar" în `tools/index.js` și `anthropic.js`. **Excepția
    de la logarea conținutului e o LISTĂ explicită** (`UNELTE_CU_CORESPONDENTA` din
    `tools/index.js`), nu o regulă pe numele uneltei. A fost `name.endsWith('_whatsapp')`, care a
    funcționat doar fiindcă ambele unelte se nimereau să se termine așa — o regulă pe nume
    încetează TĂCUT să protejeze în ziua în care cineva scrie `email_cauta`. Uneltele de Gmail
    sunt în aceeași listă, din același motiv: logurile Cloudflare se păstrează și se citesc de
    oriunde, iar corespondența cu alți oameni n-are ce căuta acolo.
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
34a. **Stub-ul agentului se învechește în timpul unui apel.** Simptomul, din producție: la
    jumătatea unei conversații, TOATE uneltele au început să răspundă cu eroare („nu pot să văd
    în Planning Center", „nu pot face notificarea"), iar închiderea și redeschiderea apelului au
    reparat tot. Nu uneltele cădeau, ci puntea: un stub din `getAgentByName` e un obiect de I/O
    legat de contextul cererii în care a fost creat, iar apelurile de unelte vin din evenimente de
    socket, minute mai târziu, în ALT context („Cannot perform I/O on behalf of a different
    request"). Punctul comun explică de ce picau deodată unelte fără nicio legătură între ele.
    De-aia **tot ce atinge agentul trece prin `VoiceSession.cuAgent()`**: la prima eroare aruncă
    stub-ul și reîncearcă o singură dată cu unul proaspăt. Se aplică și salvării transcrierii, și
    încărcării istoricului — acolo eșecul e mut și se vede abia a doua zi, ca memorie lipsă.
    Uneltele au și un termen (`TIMP_MAXIM_UNEALTA_MS`, 25 s): fără el, o cerere blocată ține
    apelul mut la nesfârșit, iar omul crede că a căzut legătura.
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
37. **Apelul se închide singur după 7 secunde de liniște** (`LINISTE_MAXIMA_MS` din
    `public/voce/app.js`; a fost 3 minute până pe 18 septembrie 2026). Pragul poate fi atât de
    scurt tocmai fiindcă închiderea NU e o pierdere: aplicația se întoarce în veghe, iar „Jarvis"
    redeschide apelul într-o secundă. Gemini se plătește la minut, iar cât ține apelul microfonul
    e al lui, deci trezirea e oprită. Sunt **trei praguri, nu unul**, și fiecare acoperă un fel de
    liniște care nu e liniște:
    - `LINISTE_INITIALA_MS` (20 s) — până vorbește cineva prima dată. Apelul poate porni din
      buzunar, la un „Jarvis"; 7 secunde l-ar închide înainte să apuci să spui ceva.
    - `LINISTE_CU_UNEALTA_MS` (45 s) — cât lucrează o unealtă. Altfel o căutare pe net mai lentă
      ar tăia apelul exact când asistentul era pe cale să răspundă.
    - **`maiAreDeSpus()`** — blocurile de audio SOSESC mult înaintea momentului în care se aud
      (se programează în coadă; `playCursor` e ora la care se termină ce e programat). Un răspuns
      de 30 de secunde poate ajunge tot în două; fără verificarea asta, restul ar fi socotit
      liniște și apelul s-ar tăia **în timp ce Jarvis vorbește**. Regresia nu s-ar vedea decât la
      răspunsuri lungi.
    Ceasul verifică la 400 ms și măsoară microfonul **local** (RMS, `PRAG_VOCE`): transcrierea de
    la server vine în rafale, cu întârziere, iar o frază lungă și liniștită ar încăpea între două
    semne de viață.
37a. **Vegherea nu are voie să atingă ce aude restul telefonului** — și a atins, o dată.
    Cuvântul de trezire ține microfonul deschis 24/7, inclusiv după ce tragi aplicația din
    recente (`onTaskRemoved` → veghe). Cât timp un microfon e deschis, Android poate comuta
    căștile Bluetooth de pe A2DP (muzică, 15-25 de trepte de volum) pe HFP/SCO (convorbire,
    5-7 trepte). Se aude exact așa: **mut la zero, maxim la o liniuță**, la orice asculți, cu
    aplicația aparent închisă. Două lucruri țin asta închisă acum, și **niciunul nu se vede din
    cod dacă nu știi de ce e acolo**:
    - `AudioRecord.setPreferredDevice(TYPE_BUILTIN_MIC)` în `AscultareMicrofon` — captura e
      legată de microfonul telefonului, deci sistemul n-are motiv să atingă căștile. De-aia
      captura e scrisă de mână și nu mai folosește `SpeechService` din Vosk: acela nu-și
      expune `AudioRecord`-ul.
    - `elibereazaRutaAudio()` la oprire — comutarea pe SCO **nu se desface singură** când
      microfonul se închide; așteaptă o renegociere care poate veni peste minute. De-asta
      „Oprește" părea că n-a mers, iar volumul se repara singur mai târziu.
37b. **`elibereazaRutaAudio()` se cheamă DOAR la oprirea de tot**, niciodată din
    `opresteTrezirea()`. Trezirea se oprește și la începutul unui apel — acolo ruta de
    convorbire tocmai se stabilește, și am rupe-o exact când începe să fie folosită.
37c. **Oprirea capturii e sincronă, deliberat** (`opresteAcum()`: flag → `recorder.stop()` →
    `join` → `release`). Un buton pe care scrie „Oprește" nu-și poate permite „aproape oprit":
    cât microfonul mai e deschis, ruta rămâne prinsă. Vechiul `SpeechService.stop()` se
    întorcea înainte ca firul să fi ieșit din `read()`.
37d. **Butoanele de volum întreabă sistemul, nu steagul nostru.** `MainActivity.fluxAudibil()`
    alege fluxul după `getMode()`/`isBluetoothScoOn()`, adică după ruta reală. Un steag
    `inApel` ținut de noi spunea doar ce *credea* aplicația că face; când cele două nu se
    potriveau, se regla fluxul greșit și butoanele păreau moarte. Steagul a fost șters.
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
43a. **Gramatica închisă NU poate spune „n-am înțeles".** Recognizerul are voie să aleagă doar
    dintre „jarvis" și „[unk]", deci orice sunet e împins spre unul din ele — o ușă trântită sau
    un cuvânt dintr-o discuție cad pe cuvântul de trezire, cu încredere mică. Până pe 18
    septembrie 2026 declanșam pe rezultate **parțiale** (cele mai grăbite ipoteze, fără nicio
    măsură a încrederii) și acceptam și variante fonetice („javis", „charvis") — variante care,
    cu gramatică închisă, **nu se puteau potrivi niciodată**, fiindcă recognizerul nu le poate
    produce. Prezența lor în cod ascundea lipsa filtrului adevărat, iar aplicația se deschidea
    singură de câteva ori pe zi. Acum: **doar rezultate finale**, cu `setWords(true)` și prag de
    încredere (`PRAG_INCREDERE`, 0.85 — o rostire adevărată iese pe la 0.9-1.0). Fiecare candidat
    respins se loghează cu încrederea lui, deci pragul se acordează din
    `adb logcat -s VoiceService` fără să ghicești. Costul: aplicația se deschide după ce TACI,
    nu în timpul rostirii.
43b. **`setVolumeControlStream` NU ajunge în timpul unui apel.** `getUserMedia` cu anulare de
    ecou face Chromium să deschidă microfonul în regim de comunicație, ceea ce pune întreg
    telefonul în `MODE_IN_COMMUNICATION`; în modul ăsta `AudioService` **ignoră** fluxul sugerat
    de aplicație și trimite butoanele de volum la volumul de APEL. Sunetul însă iese pe MEDIA (e
    redat de WebView, printr-un AudioContext), deci butoanele reglau altceva decât ce se auzea.
    Singura cale e interceptarea tastelor în `MainActivity.dispatchKeyEvent` și reglarea manuală
    a `STREAM_MUSIC`. **Consumă ȘI `ACTION_UP`** — altfel sistemul tratează ridicarea degetului
    singur și deschide totuși panoul volumului de apel. Merge doar cu aplicația pe ecran; cu
    apelul în fundal, tastele rămân ale sistemului.

### Unelte care ies din casă

44. **Căutarea pe net NU folosește un API de căutare.** `cauta_pe_net` pune întrebarea unui
    Claude care are unealta de web search rulată de Anthropic (server-side, `web_search_20260209`)
    și primește răspunsul gata rezumat, cu surse. Motivul: fără cheie nouă, fără furnizor nou și
    fără să scriem noi partea de „deschide paginile și rezumă". Costă ~10 $/1000 de căutări,
    de-aia `max_uses` e 4 — plafonul ține și latența în frâu, iar în voce omul așteaptă.
    `pause_turn` **trebuie** tratat: bucla server-side se poate opri la jumătate și se reia
    retrimițând conversația, **fără** un mesaj nou de utilizator.
44a. **Căutarea fără `web_fetch` dă răspunsuri VECHI.** Prima variantă avea doar `web_search`,
    adică doar fragmentele din rezultate — iar la „ultimul meci al Barcelonei" a raportat un
    meci de acum trei zile, fiindcă articolul lui era mai popular decât cel de alaltăieri.
    Fragmentele nu sunt ordonate după dată. Acum unealta are și `web_fetch_20260209`, ca să
    DESCHIDĂ pagina care ține evidența la zi și să citească rândul de sus, iar promptul ei are
    o secțiune „PROSPEȚIMEA" care cere să compare data găsită cu data de azi și să o spună în
    răspuns. Regula generală: **o întrebare cu „ultimul/cel mai recent" nu se poate răspunde
    din fragmente de căutare.**
44b. **Cele trei termene trebuie să rămână în ordine**, altfel unul îl retează pe celălalt și
    mesajul de eroare vine de la stratul greșit:
    `TIMP_MAXIM_MS` din unealtă (45 s) < `TERMENE_SPECIALE.cauta_pe_net` din `session.js`
    (55 s) < `LINISTE_CU_UNEALTA_MS` din `app.js` (60 s). Dacă se lungește căutarea, se urcă
    toate trei, în ordinea asta.
45. **La web search, `content` e listă la succes și OBIECT la eroare.** Un `.map` direct peste
    el aruncă și ascunde motivul real (`max_uses_exceeded` etc.) — vezi `extrage()`.
46. **WhatsApp merge prin NOTIFICĂRILE telefonului, nu printr-un API.** WhatsApp nu are API pentru
    contul personal. Alternativele, cântărite și respinse: un client neoficial tip WhatsApp Web
    (Baileys — cere un proces pornit non-stop, deci un server, și riscă blocarea numărului) și
    API-ul oficial de Business (alt număr, nu vezi conversațiile tale). `WhatsAppListener` citește
    exact notificările pe care le vezi și tu și răspunde prin același câmp de răspuns rapid.
    **Limitele sunt ale mecanismului, nu ale codului:** doar mesaje SOSITE, doar cât e telefonul
    pornit, fără istoric, fără ce ai trimis tu.
47. **Un mesaj NOU (către cine nu ne-a scris) nu poate fi trimis singur.** Se deschide WhatsApp cu
    textul pregătit (`wa.me`), iar utilizatorul apasă trimite. Android nu lasă o aplicație să
    apese butonul alteia — promptul îi spune modelului să anunțe asta, altfel ar raporta „am
    trimis" când de fapt doar a deschis o fereastră.
48. **WhatsApp repostează notificarea unei conversații cu TOT firul în ea**, la fiecare mesaj nou.
    De-aia se ia doar ultima replică din `EXTRA_MESSAGES`, iar dedup-ul există în DOUĂ locuri: pe
    telefon (ultimul text per conversație) și în SQL (același expeditor + text în ultimele 10
    minute). Fără ele, asistentul citește de cinci ori același mesaj.
49. **„Acces la notificări" nu se poate cere printr-un dialog.** E o permisiune specială, dată
    manual din Setări; pluginul poate doar deschide ecranul
    (`Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`). Starea se citește din
    `Settings.Secure.enabled_notification_listeners`, nu dintr-un steag al nostru — poate fi
    retrasă oricând fără ca aplicația să afle. Din linia de comandă:
    `adb shell settings put secure enabled_notification_listeners "<lista>:<componenta>"` —
    **citește lista existentă și adaugă la ea**, altfel dezactivezi listenerele altor aplicații.
49a. **Apelul telefonic se dă de pe telefon, nu de pe server** (`suna_pe_telefon` →
    `tip: "suna"` pe `LISTEN_SESSION` → `executaApel` din VoiceService). Orice serviciu de
    telefonie ar suna de pe un număr străin, ar costa, și cel sunat n-ar ști cine îl caută.
49b. **Agenda NU pleacă spre server.** Worker-ul trimite numele rostit; căutarea în contacte se
    face pe telefon (`ContactsContract`), și înapoi vine doar contactul ales. Cine sunt
    oamenii din agenda lui nu e treaba niciunui log din cloud.
49c. **La omonimi NU alege nimeni în locul lui.** Dacă ies mai mulți „Andrei", unealta întoarce
    variantele și nu sună — un apel dat persoanei greșite nu se ia înapoi. Aceeași regulă ca la
    dispozitivul Spotify (50d-zero): când sistemul nu poate ști, întreabă.
49d. **Fără `CALL_PHONE`, apelul NU pleacă singur** — se deschide tastatura cu numărul scris
    (`ACTION_DIAL`) și apasă omul. Nu e o eroare, e cea mai bună variantă permisă; se raportează
    ca `pornit: false` tocmai ca asistentul să nu spună „am sunat" când n-a sunat.
49e. **`confirma()` poate duce și DATE înapoi, nu doar da/nu** (al cincilea argument), iar
    `listen.js` le trece mai departe prin `date`. Fără asta, variantele de la omonimi n-ar avea
    pe unde ajunge la model.
49f. **O acțiune care atinge lumea din afară are nevoie de o POARTĂ, nu de o rugăminte în prompt.**
    Bug real, din producție: apelul a plecat, omul a închis, iar telefonul a sunat iar — la
    nesfârșit. Cauza nu e în codul de apel, ci în felul în care e ținut istoricul: `messages`
    păstrează **doar text**, deci apelurile de unealtă și rezultatele lor nu se salvează. Când
    telefonul intră în convorbire, apelul vocal se închide; la revenire se deschide unul NOU,
    care încarcă istoricul, vede „sună-l pe tata" fără nicio urmă că s-a sunat, și face lucrul
    evident. Închizi, revine, sună iar. (Dovada, din `adb logcat`: două `ACTION_CALL` la patru
    secunde distanță, apoi un `porneste` nou la zece secunde după `opreste`.)
    Trei straturi, în ordinea în care chiar țin:
    1. **`ultimulApel`/`noteazaApel` în agent + pauza din `telefon.js`** (3 minute, același
       număr). Asta e poarta — ține indiferent ce crede modelul.
    2. **`noteazaInIstoric`** scrie „(am sunat pe X)" ca text, singura formă pe care o sesiune
       vocală nouă o poate citi.
    3. Regula din prompt: **istoricul e o amintire, nu o listă de sarcini neterminate.**
    Generalizarea, valabilă pentru orice unealtă viitoare: dacă repetarea ei deranjează pe
    ALTCINEVA decât utilizatorul, promptul nu e suficient.
50. **`LISTEN_SESSION` nu mai e într-un singur sens.** Pe lângă `trimiteEveniment` (anunță și
    uită) există `trimiteComanda`, care așteaptă confirmare de la telefon
    (`{ raspuns_la, ok, motiv }` pe același socket, 10 s). Fără ea, asistentul ar spune „am trimis
    mesajul" fără să aibă de unde ști. Harta de așteptări stă **doar în memorie**, și e în regulă:
    obiectul nu hibernează cât timp are o cerere în curs.

### Spotify

50a. **Playlisturile sunt construite de MODEL, nu de Spotify.** Endpoint-urile pe care le-ai
    folosi pentru „muzică după stare" — `/recommendations` și `/audio-features` — au fost
    închise pentru aplicații noi în noiembrie 2024. Nu le căuta, nu merg. În schimb, unealta
    cere modelului o listă de căutări concrete (artiști, melodii), le caută pe toate în
    paralel, dedublează și amestecă. Un model de limbaj traduce „ceva melancolic de toamnă" în
    muzică mai bine decât un vector de „valence"/„energy" — limitarea s-a dovedit un câștig.
50b. **Amestecarea nu e cosmetică.** Fără ea, playlistul iese grupat pe căutări — toate piesele
    unui artist la rând — și se aude ca o listă de căutări, nu ca un playlist.
50b-bis. **SCRIEREA în Spotify e ÎNCHISĂ pentru aplicații personale, definitiv.** Din 15 mai
    2025, „Extended Quota" — singurul mod în care API-ul permite scrierea — cere firmă
    înregistrată, serviciu lansat și **250.000 de utilizatori lunari**. O aplicație în
    „Development mode" primește 403 pe TOT ce scrie (`POST /users/:id/playlists`,
    `POST/DELETE /playlists/:id/tracks`), inclusiv în contul propriu al dezvoltatorului, cu
    Premium și cu toate scope-urile. Cititul merge nestingherit — de-aia arată a bug de
    permisiuni și nu e. **Nu căuta reparația în cod, în scope-uri sau în cont: nu există.**
    Se recunoaște după un „Forbidden" sec, fără `reason`, pe o metodă care nu e GET; `api()` îl
    traduce în `SPOTIFY_WRITE_BLOCKED`, iar `spotifyCreeazaPlaylist` întoarce atunci
    `creat: false` **cu lista de piese găsite**, în loc să arunce — partea valoroasă (alegerea
    pieselor) o face modelul, nu Spotify, și n-are rost pierdută.
50c. **Redarea cere Premium; playlisturile nu — și 403 NU înseamnă automat „n-ai Premium".**
    Traduceam orice 403 în „îți trebuie Premium", iar Spotify îl folosește pentru cel puțin
    trei lucruri diferite. Rezultatul: la „fă-mi un playlist", un cont Premium primea „nu ai
    Premium" — mesaj fals, cauză invizibilă. `api()` citește acum `error.reason` și
    `error.message` din corp și separă scope lipsă (`SPOTIFY_SCOPE_MISSING`) de Premium
    (`SPOTIFY_PREMIUM_REQUIRED`) de restul (`SPOTIFY_FORBIDDEN`), și le loghează pe toate.
50c-bis. **Scope-urile se fixează la AUTORIZARE, nu la folosire.** Un scope adăugat în lista din
    `src/index.js` nu ajunge nicăieri până nu se reface autorizarea din browser: refresh
    token-ul vechi continuă să nu-l aibă, iar singurul semn e un 403 la prima cerere care are
    nevoie de el. Legat: fără `user-read-private`, `/me` întoarce răspuns **fără** `product` și
    `country` — adică un abonat Premium arată identic cu un cont gratuit, fără nicio eroare.
50d. **„Activ" nu înseamnă „deschis", iar 404 pe `/me/player` înseamnă „niciun dispozitiv", nu
    „ruta nu există".** Spotify Connect marchează un telefon ca activ abia după ce a cântat ceva
    măcar o dată; imediat după deschiderea aplicației, telefonul APARE în `/me/player/devices`
    dar niciunul nu e activ, iar redarea cade cu 404. `pornesteRedarea()` reia atunci comanda cu
    `?device_id=`, care e chiar mecanismul de pornire pe un dispozitiv inactiv — deci nu mai e
    nevoie ca omul să atingă telefonul. Dacă telefonul nu e nici în listă, `spotifyDeschide` îl
    deschide și se mai așteaptă 2,5 s: aplicația are nevoie de câteva secunde ca să se anunțe
    la Spotify Connect.
50d-zero. **NICIODATĂ „primul dispozitiv din listă".** Prima variantă a lui `pornesteRedarea`
    avea rezerva `lista.find(Smartphone) || lista[0]` — și a pornit muzica pe boxa Alexa din
    casă în loc de telefon. Contul are și boxe; o rezervă „dacă nu găsesc telefonul, pornesc pe
    orice" înseamnă sunet pornit din senin în altă cameră, poate noaptea. Un asistent care nu
    găsește telefonul SPUNE asta — nu alege singur altă cameră. Selecția e strict
    `type === "Smartphone"`. `spotify_deschide_pe_telefon` rămâne pentru cazul în
    care Spotify nu e deschis nicăieri (același canal de comenzi ca WhatsApp: `tip: "deschide"`
    pe `LISTEN_SESSION`).
50d-bis. **O eroare needucată devine o minciună.** 404-ul ăsta ieșea spre model ca „Spotify a
    răspuns 404", iar modelul, pus să explice ceva ce nu i s-a spus, a raportat „nu găsesc
    piesa" — trimițând omul să caute vina în numele melodiei. Orice cod de eroare pe care îl
    lăsăm nespus se întoarce ca o explicație inventată: uneltele trebuie să spună CE s-a
    întâmplat și CE să facă în schimb.
50d-ter. **Căutarea Spotify dă 5xx trecător** (văzut: 502 pe `/search?q=mii de laude`, pentru o
    piesă care există). Fără reîncercare, ieșea tot ca „nu găsesc piesa". `api()` reîncearcă o
    dată, cu 400 ms pauză, și loghează `SPOTIFY_5XX`.
50e. **Autorizarea se face din Worker, nu dintr-un playground.** Spotify n-are așa ceva, iar
    adresa de redirect trebuie să fie una pe care o controlezi — Worker-ul e deja aceea. Tokenul
    de acces călătorește prin `state`, fiindcă pe `/spotify/callback` nu mai avem cum să-l cerem.
50f. **Refresh token-ul Spotify e SINGURUL secret care nu se pune cu mâna.** Se salvează singur
    în `agent_meta`, la autorizare. Motivul e simplu: token-ul se naște în Worker, deci a-l
    afișa ca să fie lipit înapoi e un drum dus-întors care nu adaugă decât ocazia unei greșeli
    de copiere. Un `SPOTIFY_REFRESH_TOKEN` pus totuși ca secret are prioritate — de-aia
    uneltele primesc `agent` ca al treilea argument și îl cer de la el doar dacă secretul
    lipsește.

### Interfața vocală

51. **Orbul E butonul.** Mic și cenușiu = neconectat; mare și colorat = în apel. Nu există buton
    „Sună" pe ecran, iar zona de atins e un cerc cât orbul, nu tot ecranul — o atingere într-un
    colț nu are voie să închidă apelul. Comenzile (microfon, transcriere, scris, închide,
    WhatsApp) stau într-un sertar pe marginea din dreapta, deschis de pe mâner sau printr-o
    tragere de deget dinspre margine.
52. **`Orb.stare()` are PATRU valori** (`inactiv`/`conectare`/`lucreaza`/`activ`), iar raza și
    intensitatea culorii se deplasează LIN spre țintă. Trecerea „mic și gri" → „mare și colorat" E
    feedbackul că apelul a pornit; instantanee, n-ar fi văzută. Două capcane la adăugarea unei
    stări noi: `RAZE` e și lista stărilor valide (`Orb.stare()` **ignoră tăcut** orice nume care
    nu e cheie acolo), iar `deseneaza` forțează nivelurile audio la 0 pentru orice stare care nu
    e exact `'activ'` — deci o stare nouă trebuie pusă în `RAZE`, în `PALETE` **și** tratată în
    `paletaCurenta`, altfel se citește ca „bot-ul vorbește încet".
52a. **`lucreaza` (chihlimbariu) e mai MIC decât `activ`, nu mai mare** — orbul s-a retras din
    ascultare ca să facă ceva, iar scăderea de rază e vizibilă și cu `prefers-reduced-motion`.
    Acolo inelul rotitor nu dispare, ca în rest, ci **se oprește**: e singura stare al cărei inel
    e informație, nu decor (trei arce în loc de două, ca să se deosebească fără culoare).
    **Ieșirea are trei căi, toate necesare:** `tools_gata` de la server (exactă), prima vorbă a
    asistentului (cea care se întâmplă de fapt, fiindcă Gemini vorbește peste unelte), și un ceas
    de 60 s — plasa pentru drumurile pe care niciun mesaj nu mai ajunge. **60 s, nu 30**: plafonul
    real al unei unelte e 55 s (`cauta_pe_net`), iar un ceas mai scurt ar minți în mijlocul unei
    căutări legitime. Fără plasă, orbul rămâne blocat pe un apel deschis — și, fiind singurul
    indicator de stare de pe ecran (regula 51), omul crede că a căzut apelul și închide.
53. **Ridică `VERSIUNE` din `public/voce/sw.js`** la fiecare schimbare din folderul acela, altfel
    telefonul rămâne cu varianta veche. Aceleași fișiere sunt împachetate și în APK
    (`npx cap sync android`), deci o schimbare de interfață cere ȘI deploy, ȘI APK nou.
54. **Microfonul stă pe ecranul principal, nu în meniu** — cerc cu iconiță, centrat sub linia de
    status, poziționat din `--sub-orb` (variabila din `.scena` de care atârnă și statusul; dacă
    muți orbul, se mută amândouă). Motivul e că e singurul buton căutat în grabă: intră cineva
    în cameră și vrei să taci pe loc, iar prin meniu însemna trei gesturi. **Fără text
    înăuntru**, deci `aria-label` din HTML e singurul nume al butonului pentru cititoarele de
    ecran — `app.js` îl rescrie la fiecare comutare, nu-l scoate. Starea „oprit" se vede din
    FORMĂ (tăietura peste iconiță), nu doar din culoarea roșie: culoarea singură exclude pe
    oricine n-o distinge.
55. **WhatsApp e o STARE în meniu, nu un buton** (`.stare`, nu `.pastila`). Cerința a fost „vreau
    doar să știu că e integrat". Rămâne totuși apăsabilă **doar când lipsește accesul la
    notificări** — permisiunea aia nu se poate cere printr-un dialog (vezi regula 49), deci
    trebuie să existe o cale spre Setări. Când merge, e `disabled` și arată ca ce este: o
    informație.
56. **Regula „spune ce faci" e în PROMPT, nu în cod** (`src/prompt.js`, secțiunea „SPUNE CE FACI,
    NU DOAR CE A IEȘIT"), deci se aplică pe amândouă canalele — același prompt merge și la
    Claude pe Telegram, și la Gemini în voce. Partea ei cea mai importantă nu e narațiunea, ci
    **interdicția de a inventa o cauză**: un cod de eroare netradus se întoarce mereu ca o
    explicație plauzibilă și falsă. Așa a ajuns „nu găsesc piesa" să fie răspunsul la un 404
    care însemna „niciun dispozitiv activ" (vezi 50d-bis).

### Memorie, poartă, mementouri, Gmail (19 septembrie 2026)

57. **Al doilea bloc de system e pentru MEMORIE și NU e cache-uit.** `anthropic.js` trimite acum
    `system` ca două blocuri: promptul fix (cu `cache_control`, care prinde și `tools`) și, după
    el, ce ține minte Jarvis. Memoria se schimbă la fiecare faptă nouă — pusă în primul bloc, ar
    rescrie în cache tot prefixul, adică promptul întreg plus ~40 de definiții de unelte, la
    fiecare „ține minte că...". Regula generală: **orice variază de la tur la tur stă DUPĂ
    breakpoint.** Instrumentul de verificare există deja: `ANTHROPIC_USAGE cache_read` din
    `wrangler tail` trebuie să rămână mare. Blocul se omite complet când e gol — API-ul respinge
    un bloc de text gol.
57a. **În voce, memoria merge în `systemInstruction`, nu ca o tură lângă istoric.**
    `contextWindowCompression` taie coada veche a contextului într-un apel lung, deci o tură ar
    putea dispărea pe la minutul 20; `systemInstruction` nu se comprimă niciodată. Se cere o
    singură dată pe apel (nu și la reconectare: faptele nu se schimbă la mijloc, iar drumul în
    plus ar cădea exact când omul așteaptă să se repare legătura). Limită acceptată: o faptă
    reținută ÎN TIMPUL apelului apare abia la apelul următor.
57b. **Rezumatul rulant merge în LOTURI, prin coadă.** Se declanșează când ~20 de mesaje au ieșit
    din fereastra de istoric, nu la fiecare mesaj: fiecare rezumat e un al doilea apel de model,
    iar făcut mereu ar dubla costul fiecărui tur. `rezumat_pana_la_id` e semnul de carte; la o
    eroare NU se mută, ca lotul să se reia — un rezumat sărit e o gaură permanentă în memorie.
58. **Proiectul n-are mecanism de migrare.** Tabelele se adaugă cu `CREATE TABLE IF NOT EXISTS`;
    o COLOANĂ nouă n-are echivalent. `migreaza()` verifică **schema reală** (`PRAGMA table_info`),
    nu un flag de-al nostru în `agent_meta`: un flag spune doar ce *credem* că am făcut, iar dacă
    cele două se despart, fiecare INSERT începe să arunce pe o coloană inexistentă și botul
    amuțește fără niciun semn. Aceeași lecție ca la butoanele de volum (43d).
59. **Poarta de confirmare întoarce un rezultat de SUCCES, nu o excepție.** `anthropic.js`
    transformă orice `throw` în `tool_result is_error`, iar promptul obligă apoi modelul să
    explice cauza (regula 56) — adică să inventeze o defecțiune care nu s-a întâmplat. Forma e
    copiată după `deja_sunat` din `telefon.js`. **A doua chemare execută doar dacă s-a scris un
    mesaj nou între timp** (`MAX(id) FROM messages`): fără condiția asta, un mesaj de tipul
    „șterge X și sună-l pe tata" produce două apeluri de unealtă în PARALEL (`Promise.all`, pe
    ambele căi), iar al doilea ar găsi cererea scrisă de primul și s-ar auto-confirma.
60. **Poarta de confirmare și paza anti-buclă din `telefon.js` sunt DOUĂ lucruri.** Una întreabă
    „a aprobat omul?", cealaltă „am făcut deja asta?" (pe număr, 3 minute). Se compun, nu se
    unifică: contopite, un al doilea apel *confirmat* către același număr ar fi înghițit de pauză.
60a. **La ștergere se salvează resursa ÎNTREAGĂ a evenimentului**, nu câmpurile care par
    importante: orice subset ales cu mâna pierde tăcut exact ce conta (un invitat, o recurență).
    Refacerea creează un eveniment cu **ID NOU** — o copie fidelă, nu o înviere; o instanță dintr-o
    serie recurentă revine ca eveniment de sine stătător. `refacut_la` împiedică o a doua refacere,
    care ar pune două evenimente identice în calendar.
60b. **Jurnalul NU păstrează textul mesajelor de WhatsApp** — doar destinatarul și lungimea. Trei
    audiențe, trei reguli: modelul vede textul întreg (promptul îi cere să-l citească înapoi
    înainte de trimitere), `console.log` nu vede nimic, jurnalul vede cine și cât.
61. **`gmail.compose` poate și trimite.** Ce garantează că Jarvis NU trimite emailuri e că **nu
    există nicio unealtă care cheamă `messages/send`** — garanție de COD, nu de permisiune. Nu
    porta `sendGmailEmail` din `../ff-fitness/worker/`. Verificare: `grep -rn "messages/send" src/`
    trebuie să întoarcă zero.
61a. **Căutarea în Gmail întoarce doar METADATE** (expeditor, subiect, snippet). Corpurile întregi
    ar umfla contextul și ar trage corespondență privată în model fără ca cineva s-o fi cerut;
    pentru textul exact există `citeste_email`, chemat anume.
62. **Sertarul arată istoricul COMUN cu Telegram**, fiindcă e un singur agent (regula 24).
    Mesajele scrise pe Telegram se marchează prin coloana `canal` — chenar **și etichetă**, nu doar
    culoare. Rândurile dinainte de migrare au `canal` NULL și se afișează nemarcate.
    `getRecentHistory` rămâne pentru Gemini (are un contract cu `buildHistoryMessage`),
    `istoricPentruEcran` e pentru ecran: consumatori diferiți, forme diferite, ca o schimbare
    făcută pentru unul să nu-l strice tăcut pe celălalt.
63. **Un mesaj NOU de la server e compatibil înapoi cu APK-urile vechi** (`default:` din
    `handleServerMessage` le ignoră tăcut), dar un **client nou cu server vechi nu e** — de-aia
    orice stare în care se INTRĂ pe un mesaj are nevoie și de o ieșire pe ceas. **Deploy-ul se
    face întotdeauna ÎNAINTEA APK-ului.**
64. **`BOOT_COMPLETED` nu se implementează — INTENȚIONAT.** După o repornire de telefon, Jarvis NU
    ascultă până nu deschide omul aplicația o dată. Asta e o decizie de confidențialitate, cerută
    explicit: vrea să existe un moment în care ALEGE să fie auzit. **Nu e un TODO și nu e o
    scăpare** — nu o „repara".
65. **Mementourile se confirmă la DECLANȘARE, nu doar la programare.** Alarma face un
    `events.get` înainte să vorbească: măturarea parcurge evenimente, nu programări, deci n-are
    cum să anuleze alarma unui eveniment care între timp a dispărut din fereastră. Un eveniment
    mutat sau șters între măturare și alarmă e cazul normal, nu cel marginal. Dacă verificarea
    însăși eșuează, mementoul se trimite oricum — unul în plus supără, unul lipsă e chiar lucrul
    pe care mecanismul trebuia să-l împiedice. Testare fără așteptare de 20 de minute:
    `POST /internal/verifica-memento`.
66. **Cache-ul service worker-ului atinge doar coaja.** Handler-ul prindea ORICE GET, iar rutele
    Worker-ului poartă tokenul în adresă — deci cheia de cache ar fi conținut chiar cheia de acces,
    salvată pe disc, iar `/voice-history` ar fi lăsat conversație acolo. Acum: same-origin + o
    listă de prefixe de rute (care crește odată cu `src/index.js`). **Atenție la soluția care pare
    evidentă:** o listă albă pe `/voce/` ar dezactiva cache-ul complet în APK, unde coaja e
    servită din rădăcina lui `https://localhost`.

## Cum adaugi o unealtă nouă

**Trei** pași obligatorii, nu doi:
1. o intrare în `TOOL_DEFINITIONS` + un handler în `EXECUTORS` (`src/tools/index.js`);
2. regulile ei în `src/prompt.js`;
3. **numele ei în românește, în `NUME_UNELTE` din `public/voce/app.js`** — altfel, în timpul unui
   apel, ecranul o anunță cu numele ei de cod (`Verific: get_air_conditioner_state…`), adică
   singurul loc din toată interfața unde utilizatorul vede cod. Fără intrare, cade pe formularea
   neutră „verific ceva" — corectă, dar mută.

Și două întrebări, ambele cu răspunsul într-o listă din `src/tools/`:
- **e ireversibilă?** (atinge lumea din afară, nu se ia înapoi) → `ACTIUNI_CU_POARTA` din
  `tools/confirmare.js`;
- **cară corespondența altor oameni?** → `UNELTE_CU_CORESPONDENTA` din `tools/index.js`.

**`anthropic.js`, `agent.js` și calea vocală nu se modifică** — ăsta e seam-ul; unealta apare
automat și în voce.

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
# măturarea de mementouri, fără să aștepți 20 de minute
curl -X POST -H "X-Internal-Secret: <INTERNAL_ADMIN_SECRET>" \
  "https://telegram-assistant.iarisgabor.workers.dev/internal/verifica-memento"

# ce s-a vorbit (ce încarcă sertarul din PWA)
curl "https://telegram-assistant.iarisgabor.workers.dev/voice-history?token=<VOICE_ACCESS_TOKEN>&limit=5"

# e telefonul pe legătura permanentă?
curl "https://telegram-assistant.iarisgabor.workers.dev/voice-listen/stare?token=<VOICE_ACCESS_TOKEN>"
```

## Config și secrete

`[vars]` în `wrangler.toml`: `DEFAULT_TIMEZONE`, `GOOGLE_CALENDAR_ID`, `DAILY_AGENDA_HOUR`,
`MEMENTO_MINUTE`, `GMAIL_FROM_ADDRESS`,
`ALEXA_*` (5), `GEMINI_LIVE_MODEL`, `GEMINI_VOICE_LANGUAGE`, `GEMINI_VOICE_NAME`,
`GEMINI_MODALITIES_IN_SETUP`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `TWA_PACKAGE_ID`,
`TWA_FINGERPRINT`.

Secrete (`wrangler secret put`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`ANTHROPIC_API_KEY`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`,
`GOOGLE_CALENDAR_REFRESH_TOKEN`, `ALLOWED_TELEGRAM_USER_ID`, `INTERNAL_ADMIN_SECRET`,
`PLANNING_CENTER_APP_ID`, `PLANNING_CENTER_SECRET`, `ALEXA_REFRESH_TOKEN`, `GEMINI_API_KEY`,
`VOICE_ACCESS_TOKEN`, `VAPID_PRIVATE_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN`.

Durable Objects: `ASSISTANT_AGENT` (agentul, unul per utilizator), `VOICE_SESSION` (unul per
apel, id unic), `LISTEN_SESSION` (unul per utilizator, **hibernabil** — stă deschis zile întregi
și transportă câțiva octeți).

## Modele

- **Claude Sonnet 5** (`src/anthropic.js`) pentru calea Telegram — apelat direct prin `fetch()`,
  fără SDK, cu bucla de tool-use scrisă manual (max 8 iterații, tool-use paralel).
- **Gemini Live** (`GEMINI_LIVE_MODEL`) pentru voce — nativ pe audio, full-duplex. Ales pe cost:
  ~3 $/lună la ~150 min, față de ~12 $ la ElevenLabs Agents.
