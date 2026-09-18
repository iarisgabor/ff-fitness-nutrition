// PWA-ul de apel vocal: microfon → WebSocket → VoiceSession (Worker) → Gemini Live, și înapoi.
//
// Protocolul pe socketul ăsta (definit în src/voice/session.js):
//   spre server:  binar = PCM16 la 16 kHz brut;  text JSON = {type:'text'|'hangup'}
//   spre client:  binar = PCM16 la 24 kHz brut;  text JSON = status / transcript / tools / error

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const TOKEN_KEY = 'voce.token';
// Cheia publică VAPID — publică prin design: browserul o trimite serviciului de push ca să
// verifice că notificările vin de la noi. Perechea ei privată stă ca secret pe Worker.
const VAPID_PUBLIC_KEY = 'BPDBQWTiZOw0y-S7NNVKq7iebHJazis_uel3JECzf-AfSorLdRDK2qBLXjhpbACiQV3HcnhBvHQ62EWls6vh4HY';

const els = {
  call: document.getElementById('call'),
  status: document.getElementById('status'),
  diag: document.getElementById('diag'),
  mut: document.getElementById('mut'),
  transcript: document.getElementById('transcript'),
  panou: document.getElementById('panou'),
  comuta: document.getElementById('comuta'),
  auto: document.getElementById('auto'),
  textForm: document.getElementById('text-form'),
  textInput: document.getElementById('text-input'),
};

let socket = null;
let micContext = null;
let micStream = null;
let playContext = null;
let playCursor = 0;
let playingSources = [];
// Analizoarele care alimentează orbul. Cel de redare stă ÎNTRE sursele audio și difuzor, ca să
// măsoare exact ce se aude; cel de microfon e o ramură laterală, nu schimbă ce se trimite.
let micAnalyser = null;
let botAnalyser = null;
let inCall = false;
let mut = false;
// Un apel uitat deschis costa bani (Gemini se plateste la minut) si tine microfonul ocupat,
// deci si cuvantul de trezire oprit. Dupa atata liniste din ambele parti, se inchide singur
// si aplicatia se intoarce in veghe - de unde "Jarvis" il poate chema inapoi.
const LINISTE_MAXIMA_MS = 3 * 60 * 1000;
let ultimaActivitate = 0;
let ceasLiniste = null;
// Reconectare pe partea de browser: acoperă ce Worker-ul nu poate acoperi singur (deploy,
// repornirea sesiunii, rețea pierdută). `inchidereVoita` deosebește „a închis utilizatorul"
// de „a căzut legătura" — fără ea, apăsarea pe Închide ar declanșa imediat o reconectare.
const MAX_RECONECTARI_CLIENT = 6;
let reconectariClient = 0;
let inchidereVoita = false;
let micGrafGata = false;
let lastBubble = null;

// Diagnostic vizibil pe ecran: pe telefon nu există consolă, iar „nu aud nimic" are cel puțin
// trei cauze diferite (audio care nu ajunge / context audio suspendat / microfon la altă rată).
// Rândul ăsta le separă dintr-o privire.
const diag = { micRate: null, sentRate: null, blocks: 0, ctx: '—' };

function updateDiag() {
  if (!els.diag) return;
  const mic = diag.micRate ? `mic ${diag.micRate}→${diag.sentRate} Hz` : 'mic —';
  els.diag.textContent = `${mic} · redare ${diag.ctx} · ${diag.blocks} blocuri primite`;
}

// ─── Token ─────────────────────────────────────────────────────────────────────────────────
// Se deschide o singură dată cu ?token=... ; apoi rămâne în localStorage, ca butonul de pe
// ecranul principal să nu mai aibă nevoie de el în adresă.

// Tokenul deja salvat, fără nicio întrebare. Pornirea automată nu are voie să deschidă un
// dialog la lansare — dacă nu există token, așteaptă apăsarea pe „Sună".
function getTokenSalvat() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function getToken() {
  const fromUrl = new URLSearchParams(location.search).get('token');
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl);
    history.replaceState(null, '', location.pathname);
    return fromUrl;
  }
  return localStorage.getItem(TOKEN_KEY) || '';
}

// ─── Interfață ─────────────────────────────────────────────────────────────────────────────

function setStatus(text, state) {
  els.status.textContent = text;
  els.status.dataset.state = state || '';
}

// Orice semn ca se vorbeste, in oricare sens. Resetat si de audio primit, nu doar de
// transcriere: un raspuns lung fara pauze n-ar trimite transcriere destul de des.
function semnDeViata() {
  ultimaActivitate = Date.now();
}

function pornesteCeasulDeLiniste() {
  semnDeViata();
  clearInterval(ceasLiniste);
  ceasLiniste = setInterval(() => {
    if (!inCall) return;
    if (Date.now() - ultimaActivitate < LINISTE_MAXIMA_MS) return;
    note('Am închis apelul — nu s-a mai vorbit de câteva minute.');
    endCall();
  }, 15000);
}

function setCallState(active) {
  inCall = active;
  els.call.dataset.active = active ? 'true' : 'false';
  els.call.textContent = active ? 'Închide' : 'Sună';
  els.mut.disabled = !active;
  if (!active) setMut(false); // fiecare apel începe cu microfonul pornit
}

// Microfon oprit = asistentul nu te mai aude. Nu oprește apelul și nu-l oprește pe el din
// vorbit — dacă tocmai spune ceva, termină.
//
// Se taie în DOUĂ locuri, intenționat: `track.enabled = false` oprește captura la nivel de
// browser (indicatorul de microfon al telefonului se stinge, deci se și vede că e oprit), iar
// verificarea din bucla de trimitere se asigură că nu pleacă nimic pe fir. Doar prima ar lăsa
// blocuri de liniște să curgă degeaba spre Gemini; doar a doua ar ține microfonul aprins.
function setMut(valoare) {
  mut = valoare;
  els.mut.setAttribute('aria-pressed', valoare ? 'true' : 'false');
  els.mut.setAttribute('aria-label', valoare ? 'Pornește microfonul' : 'Oprește microfonul');

  if (micStream) {
    for (const track of micStream.getAudioTracks()) track.enabled = !valoare;
  }

  // Statusul se atinge doar în timpul apelului, ca să nu acopere un mesaj de eroare.
  if (inCall) {
    if (valoare) setStatus('Microfon oprit — nu te aude.', '');
    else setStatus('Te ascult.', 'live');
  }
}

// Transcrierea vine în fragmente; le lipim în aceeași bulă cât timp vorbește același rol.
function appendTranscript(role, text) {
  if (!lastBubble || lastBubble.dataset.role !== role) {
    lastBubble = document.createElement('p');
    lastBubble.className = 'bubble';
    lastBubble.dataset.role = role;
    els.transcript.appendChild(lastBubble);
  }
  lastBubble.textContent += text;
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function note(text) {
  const el = document.createElement('p');
  el.className = 'note';
  el.textContent = text;
  els.transcript.appendChild(el);
  els.transcript.scrollTop = els.transcript.scrollHeight;
  lastBubble = null;
}

// ─── Redare ────────────────────────────────────────────────────────────────────────────────

function playChunk(arrayBuffer) {
  if (!playContext) return;

  diag.blocks += 1;
  semnDeViata();
  // Politica de autoplay poate suspenda contextul chiar și după pornire (ex. la revenirea din
  // fundal). Fără asta, blocurile se programează în gol și pagina pare mută, fără nicio eroare.
  if (playContext.state === 'suspended') {
    playContext.resume().catch(() => {});
  }
  diag.ctx = playContext.state;
  updateDiag();

  const pcm = new Int16Array(arrayBuffer);
  if (pcm.length === 0) return;

  const floats = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) floats[i] = pcm[i] / 32768;

  const buffer = playContext.createBuffer(1, floats.length, OUTPUT_SAMPLE_RATE);
  buffer.copyToChannel(floats, 0);

  const source = playContext.createBufferSource();
  source.buffer = buffer;
  // Prin analizor, nu direct la difuzor — altfel orbul n-ar avea ce măsura când vorbește el.
  source.connect(botAnalyser || playContext.destination);

  // Coadă: fiecare bloc pornește exact unde s-a terminat precedentul, ca vocea să fie continuă.
  // Mica rezervă de 80 ms acoperă variațiile de rețea fără să se audă întreruperi.
  const now = playContext.currentTime;
  if (playCursor < now + 0.08) playCursor = now + 0.08;
  source.start(playCursor);
  playCursor += buffer.duration;

  playingSources.push(source);
  source.onended = () => {
    playingSources = playingSources.filter((s) => s !== source);
  };
}

// Utilizatorul a vorbit peste model: tot ce era programat spre redare se aruncă, altfel s-ar
// auzi în continuare o replică la care el a renunțat deja.
function stopPlayback() {
  for (const source of playingSources) {
    try {
      source.stop();
    } catch {
      /* deja oprit */
    }
  }
  playingSources = [];
  playCursor = playContext ? playContext.currentTime : 0;
}

// ─── Apel ──────────────────────────────────────────────────────────────────────────────────

async function startCall() {
  let token = getToken();

  // În aplicația nativă cheia e împachetată în APK, deci nu se cere niciodată. Aici se și
  // vede de ce nu putea fi pusă în pagină: pagina e servită public pe internet, APK-ul nu.
  if (!token) {
    const dinAplicatie = await cheieDinAplicatie();
    if (dinAplicatie) {
      token = dinAplicatie;
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {
        /* o va cere de la plugin data viitoare */
      }
    }
  }

  if (!token) {
    // În APK nu există bară de adrese, deci `?token=` nu e o cale disponibilă — tokenul trebuie
    // să poată fi introdus din aplicație, o singură dată, la prima pornire.
    token = (window.prompt('Cheia de acces (o dai o singură dată):') || '').trim();
    if (!token) {
      setStatus('Fără cheie de acces nu pot suna.', 'error');
      setCallState(false);
      return;
    }
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* fără localStorage o va cere la fiecare pornire */
    }
  }

  setCallState(true);
  setStatus('Pornesc microfonul…', 'busy');
  inchidereVoita = false;
  reconectariClient = 0;
  micGrafGata = false;

  // Contextul de redare se creează AICI, înainte de orice `await` — deci încă în interiorul
  // gestului de apăsare. Creat după `getUserMedia`, pornește „suspended" pe iOS și pe unele
  // Android-uri, iar tot ce programezi în el se pierde în tăcere, fără nicio eroare.
  playContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
  playCursor = 0;
  playContext.resume().catch(() => {});
  // Un bloc gol, redat imediat: deblochează ieșirea audio pe iOS, unde primul sunet trebuie să
  // plece dintr-un gest al utilizatorului, altfel tot ce urmează rămâne mut.
  try {
    const tacere = playContext.createBufferSource();
    tacere.buffer = playContext.createBuffer(1, 1, playContext.sampleRate);
    tacere.connect(playContext.destination);
    tacere.start(0);
  } catch {
    /* fără consecințe dacă nu merge */
  }
  botAnalyser = playContext.createAnalyser();
  botAnalyser.fftSize = 512;
  botAnalyser.connect(playContext.destination);

  diag.ctx = playContext.state;
  updateDiag();

  try {
    // noiseSuppression și autoGainControl OPRITE intenționat: procesarea agresivă din browser
    // taie exact detaliile pe care se bazează transcrierea (mai ales la nume proprii).
    // echoCancellation rămâne pornit — fără el, difuzorul se aude înapoi în microfon.
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    // endCall întâi, ca să nu rămână contextul de redare deschis degeaba; abia apoi mesajul,
    // fiindcă endCall pune el statusul „Închis.".
    endCall(false);
    setStatus('Nu am acces la microfon.', 'error');
    return;
  }

  // Două contexte, fiindcă ratele diferă: 16 kHz la captură, 24 kHz la redare. Rata cerută e
  // doar o sugestie — dacă browserul o ignoră, worklet-ul reeșantionează el (vezi capture-worklet.js).
  micContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
  await micContext.resume().catch(() => {});

  await micContext.audioWorklet.addModule('capture-worklet.js');

  setStatus('Mă conectez…', 'busy');
  deschideSocket(token);
  tineApelulInFundal(true);
  pornesteCeasulDeLiniste();

  // Abonarea la notificări se face în paralel cu apelul, nu îl blochează.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => pregatesteNotificari(registration, token))
      .catch(() => {});
  }
}

// Deschiderea socketului e separată de pornirea apelului tocmai ca să poată fi refăcută:
// microfonul, contextele audio și orbul rămân pe loc, se schimbă doar firul spre server.
// Bucla de captură trimite spre variabila `socket`, deci după reconectare ia singură noul socket.
// Adresa Worker-ului. NU se poate deduce din `location`: în aplicația nativă pagina e servită
// local (https://localhost), deci o adresă relativă ar duce spre telefon, nu spre server.
// Pe web, `location.host` e chiar Worker-ul, deci îl folosim pe el și rămâne portabil.
const GAZDA_WORKER = 'telegram-assistant.iarisgabor.workers.dev';

function gazdaServer() {
  const local =
    !!window.Capacitor || location.hostname === 'localhost' || location.protocol === 'file:';
  return local ? GAZDA_WORKER : location.host;
}

function deschideSocket(token) {
  const url = new URL(`wss://${gazdaServer()}/voice-ws`);
  if (location.protocol === 'http:' && !window.Capacitor) url.protocol = 'ws:';
  url.searchParams.set('token', token);

  socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('open', () => {
    reconectariClient = 0; // legătura ține: bugetul de reîncercări se reface
    if (micGrafGata) return; // reconectare: graful audio există deja, nu-l construim iar

    micGrafGata = true;
    const source = micContext.createMediaStreamSource(micStream);
    const capture = new AudioWorkletNode(micContext, 'capture-processor', {
      processorOptions: { targetSampleRate: INPUT_SAMPLE_RATE },
    });
    capture.port.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'rate') {
        diag.micRate = message.input;
        diag.sentRate = message.output;
        updateDiag();
        return;
      }
      if (message.type === 'audio' && !mut && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message.data);
      }
    };
    source.connect(capture);

    // Ramură laterală pentru orb: ascultă microfonul fără să schimbe ce se trimite spre Gemini.
    micAnalyser = micContext.createAnalyser();
    micAnalyser.fftSize = 512;
    source.connect(micAnalyser);
    Orb.conecteaza({ user: micAnalyser, bot: botAnalyser });

    // Fără destinație nu se aude nimic înapoi, dar unele browsere opresc graful dacă nu e
    // conectat la ieșire — gain 0 îl ține activ, în tăcere.
    const mute = micContext.createGain();
    mute.gain.value = 0;
    capture.connect(mute).connect(micContext.destination);
  });

  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      playChunk(event.data);
      return;
    }
    let message = null;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    handleServerMessage(message);
  });

  // Worker-ul își reface singur legătura cu Gemini. Ce NU poate el acoperi e propria dispariție:
  // un deploy, o repornire a Durable Object-ului, sau telefonul care pierde rețeaua. Atunci cade
  // socketul ăsta, iar reconectarea trebuie pornită de aici.
  socket.addEventListener('close', () => {
    if (!inCall || inchidereVoita) {
      if (inCall) note('Apel încheiat.');
      endCall(false);
      return;
    }
    reconecteazaClient(token);
  });

  socket.addEventListener('error', () => {
    /* după 'error' vine întotdeauna 'close' — acolo se decide reconectarea */
  });
}

async function reconecteazaClient(token) {
  if (reconectariClient >= MAX_RECONECTARI_CLIENT) {
    note('Nu am putut reface legătura.');
    endCall(false);
    return;
  }

  reconectariClient += 1;
  setStatus('Refac legătura…', 'busy');

  // Pauză crescătoare: dacă serverul tocmai a fost repornit, are nevoie de câteva secunde.
  await new Promise((gata) => setTimeout(gata, Math.min(700 * reconectariClient, 4000)));
  if (!inCall || inchidereVoita) return;

  deschideSocket(token);
}

function handleServerMessage(message) {
  switch (message.type) {
    case 'status':
      if (message.status === 'ready') setStatus('Te ascult.', 'live');
      else if (message.status === 'connecting') setStatus('Mă conectez…', 'busy');
      else if (message.status === 'turn_complete') lastBubble = null;
      // Reconectare: apelul NU s-a terminat. Worker-ul reface legătura cu handle-ul de reluare,
      // iar microfonul continuă să înregistreze — ce spui între timp nu se pierde.
      else if (message.status === 'reconnecting') setStatus('Refac legătura…', 'busy');
      break;
    case 'transcript':
      semnDeViata();
      appendTranscript(message.role, message.text);
      break;
    case 'tools':
      note(`Verific: ${message.names.join(', ')}`);
      break;
    case 'interrupted':
      stopPlayback();
      lastBubble = null;
      break;
    case 'error':
      setStatus(message.message, 'error');
      break;
    default:
      break;
  }
}

function endCall(tellServer = true) {
  inchidereVoita = true;
  micGrafGata = false;
  if (tellServer && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'hangup' }));
  }
  if (socket) {
    try {
      socket.close();
    } catch {
      /* deja închis */
    }
    socket = null;
  }

  clearInterval(ceasLiniste);
  ceasLiniste = null;
  tineApelulInFundal(false);
  Orb.opreste();
  micAnalyser = null;
  botAnalyser = null;

  stopPlayback();
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop();
    micStream = null;
  }
  if (micContext) {
    micContext.close().catch(() => {});
    micContext = null;
  }
  if (playContext) {
    playContext.close().catch(() => {});
    playContext = null;
  }

  setCallState(false);
  setStatus('Închis.', '');
  lastBubble = null;
}

// Panoul de transcriere: ascuns, rămâne doar orbul pe tot ecranul. Alegerea se ține minte, ca
// să nu trebuiască apăsat la fiecare apel.
const PANOU_KEY = 'voce.panou';

function setPanou(deschis) {
  els.panou.dataset.deschis = deschis ? 'true' : 'false';
  els.comuta.setAttribute('aria-pressed', deschis ? 'true' : 'false');
  try {
    localStorage.setItem(PANOU_KEY, deschis ? '1' : '0');
  } catch {
    /* localStorage poate lipsi în navigare privată */
  }
}

els.comuta.addEventListener('click', () => {
  setPanou(els.panou.dataset.deschis !== 'true');
});

try {
  if (localStorage.getItem(PANOU_KEY) === '0') setPanou(false);
} catch {
  /* rămâne deschis, valoarea implicită */
}

els.mut.addEventListener('click', () => setMut(!mut));

els.call.addEventListener('click', () => {
  if (inCall) endCall();
  else startCall();
});

// Canal de rezervă: dacă microfonul nu merge (sau e nepotrivit să vorbești), scrii. Același
// agent, aceleași unelte — răspunsul vine tot vocal.
els.textForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = els.textInput.value.trim();
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'text', text }));
  appendTranscript('user', text);
  lastBubble = null;
  els.textInput.value = '';
});

// ─── Notificări ──────────────────────────────────────────────────────────────────────────

// Cheia publică VAPID, în forma pe care o cere browserul (octeți, nu text).
function cheieVapid(base64url) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function pregatesteNotificari(registration, token) {
  if (!('PushManager' in window) || !VAPID_PUBLIC_KEY) return;

  // Permisiunea se cere DUPĂ ce utilizatorul a apăsat „Sună" — nu la încărcarea paginii.
  // Cerută din senin, la intrare, e reflexul tuturor să o refuze, iar Android nu mai întreabă
  // a doua oară.
  if (Notification.permission === 'denied') return;
  if (Notification.permission === 'default') {
    const raspuns = await Notification.requestPermission().catch(() => 'denied');
    if (raspuns !== 'granted') return;
  }

  try {
    // Tokenul, într-un cache pe care service worker-ul îl poate citi: el n-are acces la
    // localStorage, iar ca să ceară textul notificării are nevoie să se autentifice.
    const cache = await caches.open('voce-token');
    await cache.put('token', new Response(token));

    const abonament =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: cheieVapid(VAPID_PUBLIC_KEY),
      }));

    await fetch(
      `https://${gazdaServer()}/voice-push/subscribe?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(abonament),
      }
    );
  } catch (err) {
    // Notificările sunt un plus; dacă nu merg, apelul rămâne neatins.
    console.warn('Notificările nu au putut fi pornite:', err);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ─── Fundal (doar în aplicația nativă) ───────────────────────────────────────────────────
//
// Pe web, apelul moare când ieși din pagină și nu există nimic de făcut: browserul suspendă
// tot. În aplicația Android (Capacitor) există un serviciu de prim-plan care ține procesul
// viu — aceeași pagină, aceeași captură, doar că procesul nu mai e oprit.
//
// Același fișier rulează în ambele locuri. Pe web, `window.Capacitor` nu există, apelurile de
// mai jos nu fac nimic, și nu se strică nimic.

function pluginApel() {
  const plugin = window.Capacitor?.Plugins?.Apel;
  return plugin || null;
}

// Cheia împachetată în APK (res/values/token.xml). Pe web nu există plugin, deci întoarce gol
// și rămâne calea obișnuită: `?token=...` o singură dată, apoi localStorage.
async function cheieDinAplicatie() {
  const plugin = pluginApel();
  if (!plugin || !plugin.cheie) return '';
  try {
    const raspuns = await plugin.cheie();
    return (raspuns?.token || '').trim();
  } catch {
    return '';
  }
}

async function tineApelulInFundal(pornit) {
  const plugin = pluginApel();
  if (!plugin) return;
  try {
    if (pornit) await plugin.porneste({ token: getTokenSalvat() || (await cheieDinAplicatie()) });
    else await plugin.opreste();
  } catch (err) {
    // Refuzul permisiunii de microfon ajunge aici. Apelul merge în continuare cât ești în
    // aplicație — doar fundalul se pierde, deci nu oprim nimic.
    console.warn('Serviciul de fundal nu a pornit:', err);
    if (pornit) note('Apelul nu va continua când ieși din aplicație.');
  }
}

// ─── Pornire automată ────────────────────────────────────────────────────────────────────
//
// Deschizi aplicația, ești deja în apel. Microfonul merge fără atingere, fiindcă permisiunea a
// fost dată o dată și browserul o ține minte. DIFUZORUL nu: politica de autoplay cere o atingere
// înainte de primul sunet, iar fără ea contextul de redare pornește „suspended" și tot ce
// primim se pierde în tăcere, fără nicio eroare.
//
// De-aia nu pretindem că merge: dacă rămâne blocat, spunem pe ecran ce e de făcut și ascultăm
// prima atingere de oriunde din pagină ca să-l deblocăm.

const AUTO_KEY = 'voce.auto';

function autoPornit() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
}

function setAuto(pornit) {
  els.auto.setAttribute('aria-pressed', pornit ? 'true' : 'false');
  try {
    localStorage.setItem(AUTO_KEY, pornit ? '1' : '0');
  } catch {
    /* rămâne doar pentru sesiunea asta */
  }
}

function deblocheazaLaAtingere() {
  const deblocheaza = () => {
    if (playContext && playContext.state === 'suspended') {
      playContext.resume().catch(() => {});
    }
    if (inCall) setStatus(mut ? 'Microfon oprit — nu te aude.' : 'Te ascult.', mut ? '' : 'live');
    document.removeEventListener('pointerdown', deblocheaza);
  };
  document.addEventListener('pointerdown', deblocheaza, { once: true });
}

els.auto.addEventListener('click', () => {
  setAuto(els.auto.getAttribute('aria-pressed') !== 'true');
});

setAuto(autoPornit());

// Deschisă prin „Jarvis" sau printr-un apel: sună chiar dacă pornirea automată e oprită —
// ai cerut-o explicit prin voce, deci nu mai are sens să aștepte o apăsare.
async function poateSaSune() {
  if (!getTokenSalvat() && !(await cheieDinAplicatie())) return false;
  if (await deschisaPentruApel()) return true;
  return autoPornit();
}

poateSaSune().then((da) => {
  // Fără apel: rămânem de veghe, ca „Jarvis" să funcționeze cu aplicația închisă.
  // CU apel: vegherea ar cere microfonul în același timp cu apelul, deci nu se pornește aici —
  // se reia singură când închizi apelul (vezi opreste() din VoicePlugin).
  if (!da) {
    pornesteVeghea();
    return;
  }
  startCall().then(() => {
    // Verificat după pornire, nu înainte: abia acum știm dacă browserul a lăsat sunetul să iasă.
    if (playContext && playContext.state === 'suspended') {
      setStatus('Atinge ecranul ca să auzi.', 'busy');
      deblocheazaLaAtingere();
    }
  });
});

// ─── Veghe permanentă (doar în aplicația nativă) ──────────────────────────────────────────
//
// Serviciul nativ ascultă după „Jarvis" și ține deschisă legătura prin care asistentul te poate
// suna. Pornit o dată, rămâne pornit — inclusiv după ce închizi aplicația.
//
// Cuvântul de trezire e englezesc fiindcă modelul offline folosit (Vosk) nu are variantă
// românească. Conversația rămâne în română; doar cuvântul de chemare e „Jarvis".
async function pornesteVeghea() {
  const plugin = pluginApel();
  if (!plugin || !plugin.staDeVeghe) return;
  const token = getTokenSalvat() || (await cheieDinAplicatie());
  if (!token) return;
  try {
    await plugin.staDeVeghe({ token });
  } catch (err) {
    console.warn('Vegherea nu a pornit:', err);
  }
}

// Deschisă de „Jarvis" sau de un apel de pe ecranul de blocare → sună direct, fără apăsare.
async function deschisaPentruApel() {
  const plugin = pluginApel();
  if (!plugin || !plugin.cheamatDeTrezire) return false;
  try {
    const raspuns = await plugin.cheamatDeTrezire();
    return !!raspuns?.da;
  } catch {
    return false;
  }
}

if (window.Capacitor) {
  // Revenirea în aplicație după ce „Jarvis" a deschis-o din fundal: steagul se citește și
  // atunci, nu doar la pornirea la rece.
  document.addEventListener('resume', async () => {
    if (!inCall && (await deschisaPentruApel())) startCall();
  });
}
