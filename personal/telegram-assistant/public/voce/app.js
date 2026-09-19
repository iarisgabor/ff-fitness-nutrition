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
  auto: document.getElementById('auto'),
  textForm: document.getElementById('text-form'),
  textInput: document.getElementById('text-input'),
  // Orbul e butonul: atingi cercul, nu o pastilă cu scris pe ea.
  orbButon: document.getElementById('orb-buton'),
  // Comenzile stau într-un sertar pe marginea din dreapta. În mod normal ecranul e gol.
  maner: document.getElementById('maner'),
  meniu: document.getElementById('meniu'),
  voal: document.getElementById('voal'),
  inchideMeniu: document.getElementById('inchide-meniu'),
  whatsapp: document.getElementById('whatsapp'),
  microfonAcces: document.getElementById('microfon-acces'),
  // Ce s-a vorbit ÎNAINTE de apelul ăsta, încărcat din istoricul agentului. Container separat de
  // #transcript, nu o listă comună: granița dintre „înainte" și „acum" e chiar granița dintre
  // cele două cutii, deci nu se poate dezordona niciodată.
  istoric: document.getElementById('istoric'),
  separatorAcum: document.getElementById('separator-acum'),
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
// Apelul se închide singur când nu se mai vorbește. Nu e o comoditate: Gemini se plătește la
// minut, iar cât ține apelul microfonul e al lui, deci cuvântul de trezire e oprit. Închis, se
// întoarce în veghe — de unde „Jarvis" îl cheamă înapoi într-o secundă. Asta face ca pragul să
// poată fi scurt: nu pierzi nimic, doar reiei.
const LINISTE_MAXIMA_MS = 7000;
// Prima liniște e mai lungă. Apelul tocmai s-a deschis, poate din buzunar, la un „Jarvis" —
// șapte secunde până să apuci să spui ceva ar închide apelul înainte să înceapă.
const LINISTE_INITIALA_MS = 20000;
// Cât lucrează o unealtă NU e liniște, e așteptare: nimeni nu vorbește, dar apelul e în plină
// treabă. Fără excepția asta, orice căutare mai lentă de șapte secunde ar tăia apelul exact
// când asistentul era pe cale să răspundă.
const LINISTE_CU_UNEALTA_MS = 60000;
// Peste ce nivel socotim că se vorbește. Transcrierea vine cu întârziere și în rafale; fără o
// măsurare locală, o frază lungă și liniștită ar putea încăpea între două semne de viață.
const PRAG_VOCE = 0.035;
let ultimaActivitate = 0;
let aVorbitCineva = false;
// CÂND a început ultima unealtă, nu DACĂ una e în curs. Diferența a costat un apel tăiat în
// mijlocul unei căutări pe net: steagul boolean se ștergea la prima transcriere primită, iar
// transcrierea replicii „o clipă, caut" sosește DUPĂ ce unealta a pornit. Fereastra revenea
// astfel la șapte secunde exact în timpul căutării. O oră de ceas nu se poate șterge din
// greșeală — expiră singură.
let ultimaUnealta = 0;
let ceasLiniste = null;
let vadBuffer = null;
// Reconectare pe partea de browser: acoperă ce Worker-ul nu poate acoperi singur (deploy,
// repornirea sesiunii, rețea pierdută). `inchidereVoita` deosebește „a închis utilizatorul"
// de „a căzut legătura" — fără ea, apăsarea pe Închide ar declanșa imediat o reconectare.
const MAX_RECONECTARI_CLIENT = 6;
let reconectariClient = 0;
let inchidereVoita = false;
let micGrafGata = false;
let lastBubble = null;
// Istoricul se încarcă la PRIMA deschidere a sertarului, nu la pornirea aplicației: sertarul se
// deschide mult mai des ca să apeși Mute decât ca să citești ce s-a vorbit.
let istoricIncarcat = false;
// Ceasul care scoate orbul din „lucrează" dacă nu vine niciun semn de la server. Vezi iesiDinLucru.
let ceasUnealta = null;

// Numele uneltelor, în românește. AL DOILEA PAS când adaugi o unealtă (primul e
// src/tools/index.js): fără o intrare aici, ecranul arată numele ei de cod, adică singurul loc
// din toată interfața unde utilizatorul vede cod.
const NUME_UNELTE = {
  create_calendar_event: 'pun în calendar',
  find_calendar_events: 'mă uit în calendar',
  update_calendar_event: 'schimb în calendar',
  delete_calendar_event: 'șterg din calendar',
  list_service_types: 'mă uit în Planning Center',
  find_service_plans: 'caut programul de duminică',
  get_plan_schedule: 'văd cine e programat',
  get_plan_items: 'mă uit peste program',
  search_people: 'caut persoana',
  update_team_member_status: 'schimb în echipă',
  list_teams: 'mă uit la echipe',
  list_team_positions: 'mă uit la poziții',
  sign_up_for_position: 'te înscriu',
  remove_from_schedule: 'te scot din program',
  get_top_songs: 'mă uit la cântări',
  get_top_scheduled_people: 'mă uit la cine slujește',
  get_air_conditioner_state: 'întreb aerul condiționat',
  control_air_conditioner: 'dau comanda la aer',
  schedule_air_conditioner: 'programez aerul',
  list_air_conditioner_schedules: 'mă uit la programările aerului',
  cancel_air_conditioner_schedule: 'anulez programarea aerului',
  programeaza_apel: 'îmi pun ceas',
  trimite_notificare: 'îți trimit o notificare',
  cauta_pe_net: 'caut pe internet',
  citeste_mesaje_whatsapp: 'mă uit pe WhatsApp',
  trimite_mesaj_whatsapp: 'trimit pe WhatsApp',
  spotify_ce_canta: 'întreb ce cântă',
  spotify_reda: 'pun muzica',
  spotify_controleaza: 'schimb la muzică',
  spotify_creeaza_playlist: 'fac playlistul',
  spotify_deschide_pe_telefon: 'deschid Spotify',
  suna_pe_telefon: 'dau telefon',
  tine_minte: 'țin minte',
  ce_tii_minte: 'mă uit la ce știu',
  uita: 'uit',
  ce_ai_facut: 'mă uit ce am făcut',
  refa_actiunea: 'refac',
  cauta_emailuri: 'caut pe mail',
  rezumat_inbox: 'mă uit pe mail',
  citeste_email: 'citesc emailul',
  creeaza_ciorna: 'scriu ciorna',
};

function descrieUnelte(names) {
  const traduse = (names || []).map((n) => NUME_UNELTE[n]).filter(Boolean);
  // O unealtă necunoscută (server mai nou decât aplicația) primește o formulare neutră, nu una
  // ghicită din numele ei. Aceeași regulă ca în prompt: mai bine „ceva" decât o explicație
  // inventată care trimite omul să caute unde nu e.
  if (traduse.length === 0) return 'verific ceva';
  if (traduse.length === 1) return traduse[0];
  return `${traduse.slice(0, -1).join(', ')} și ${traduse[traduse.length - 1]}`;
}

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
// dialog la lansare — dacă nu există token, așteaptă atingerea orbului.
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
  aVorbitCineva = true;
}

// Microfonul, măsurat local, în fiecare verificare. Ramura asta e ieftină (un RMS peste 512 de
// eșantioane) și e singura care știe în timp real dacă omul chiar vorbește — serverul află abia
// când termină fraza.
function seVorbesteAcum() {
  if (!micAnalyser || mut) return false;
  if (!vadBuffer || vadBuffer.length !== micAnalyser.fftSize) {
    vadBuffer = new Uint8Array(micAnalyser.fftSize);
  }
  micAnalyser.getByteTimeDomainData(vadBuffer);
  let suma = 0;
  for (let i = 0; i < vadBuffer.length; i += 1) {
    const v = (vadBuffer[i] - 128) / 128;
    suma += v * v;
  }
  return Math.sqrt(suma / vadBuffer.length) > PRAG_VOCE;
}

// Blocurile de la Gemini SOSESC mult înaintea momentului în care se aud: se programează în
// coadă, iar `playCursor` e ora la care se termină ce e programat. Un răspuns de treizeci de
// secunde poate ajunge tot în două — fără verificarea asta, ceasul ar socoti restul drept
// liniște și ar tăia apelul exact în timp ce Jarvis vorbește.
function maiAreDeSpus() {
  return !!playContext && playCursor > playContext.currentTime + 0.05;
}

function ragazLiniste() {
  if (Date.now() - ultimaUnealta < LINISTE_CU_UNEALTA_MS) return LINISTE_CU_UNEALTA_MS;
  return aVorbitCineva ? LINISTE_MAXIMA_MS : LINISTE_INITIALA_MS;
}

function pornesteCeasulDeLiniste() {
  ultimaActivitate = Date.now();
  aVorbitCineva = false;
  ultimaUnealta = 0;
  clearInterval(ceasLiniste);
  // Verificat des (nu la 15 secunde, ca înainte): cu un prag de șapte secunde, un ceas rar ar
  // însemna că apelul se închide oriunde între 7 și 22 de secunde, adică imprevizibil.
  ceasLiniste = setInterval(() => {
    if (!inCall) return;
    if (seVorbesteAcum() || maiAreDeSpus()) semnDeViata();
    if (Date.now() - ultimaActivitate < ragazLiniste()) return;
    note('Am închis apelul — nu s-a mai vorbit.');
    endCall();
  }, 400);
}

function setCallState(active) {
  // Garda nu e un moft: `setCallState(false)` se cheamă și pe drumuri care nu sunt sfârșitul
  // unui apel — la lipsa cheii de acces (fără niciun `true` înainte). Fără ea, telefonul ar
  // bâzâi „apel încheiat" pentru apeluri care n-au existat.
  const schimbare = active !== inCall;
  inCall = active;
  els.call.dataset.active = active ? 'true' : 'false';
  els.call.textContent = active ? 'Închide apelul' : 'Sună';
  els.mut.disabled = !active;
  els.orbButon.setAttribute('aria-label', active ? 'Închide apelul' : 'Sună');
  // Orbul se întoarce mic și cenușiu de îndată ce apelul s-a terminat, fără să aștepte nimic —
  // e singurul indiciu de pe ecran că nu mai ești în legătură.
  if (!active) Orb.opreste();
  if (!active) setMut(false); // fiecare apel începe cu microfonul pornit
  if (schimbare) vibra(active ? 'inceput' : 'sfarsit');
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

// ─── Starea „lucrează" a orbului ───────────────────────────────────────────────────────────
//
// Între întrebare și răspuns e tăcere, iar orbul arăta identic cu unul care aștepta să vorbești.
// Acum se retrage puțin și devine chihlimbariu cât lucrează uneltele.
//
// Ieșirea are TREI căi, și toate trei sunt necesare:
//   1. `tools_gata` de la server — cea exactă;
//   2. prima vorbă a asistentului (vezi `case 'transcript'`) — cea care se întâmplă de fapt;
//   3. ceasul de mai jos — plasa, pentru drumurile pe care niciun mesaj nu mai ajunge:
//      reconectare pe socket nou, Durable Object evacuat, un deploy la mijlocul apelului, sau o
//      aplicație mai nouă decât Worker-ul. Fără ea, orbul ar rămâne blocat în „lucrează" cu
//      apelul deschis — iar orbul e singurul indicator de stare de pe ecran, deci omul ar crede
//      că a murit apelul și ar închide.
//
// 60 de secunde, nu 30: plafonul real al serverului pentru o unealtă e 55 s (căutarea pe net,
// `TERMENE_SPECIALE` din voice/session.js). Un ceas mai scurt ar minți exact în mijlocul unei
// căutări legitime.
const PLAFON_UNEALTA_MS = 60000;

function intraInLucru() {
  if (!inCall) return;
  Orb.stare('lucreaza');
  clearTimeout(ceasUnealta);
  ceasUnealta = setTimeout(iesiDinLucru, PLAFON_UNEALTA_MS);
}

function iesiDinLucru() {
  clearTimeout(ceasUnealta);
  ceasUnealta = null;
  if (inCall) Orb.stare('activ');
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
  Orb.stare('conectare');
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

    // `err.name` nu se arunca la gunoi degeaba: „Nu am acces la microfon" acoperea trei situații
    // complet diferite, cu trei rezolvări diferite, și nu spunea niciuna. Mai rău, refuzul de
    // permisiune e o FUNDĂTURĂ — odată respinsă, cererea nu mai deschide niciun dialog, deci
    // reapăsarea orbului repetă la nesfârșit același mesaj.
    const nume = err && err.name ? err.name : '';
    if (nume === 'NotAllowedError' || nume === 'SecurityError') {
      setStatus(
        window.Capacitor
          ? 'Ai refuzat microfonul. Deschide sertarul ca să dai acces.'
          : 'Ai refuzat microfonul. Dă-i voie din lacătul de lângă adresă, apoi reîncarcă.',
        'error'
      );
      arataAccesulLaMicrofon(false);
    } else if (nume === 'NotFoundError' || nume === 'OverconstrainedError') {
      setStatus('Nu găsesc niciun microfon pe dispozitivul ăsta.', 'error');
    } else if (nume === 'NotReadableError' || nume === 'AbortError') {
      setStatus('Microfonul e folosit de altceva. Închide cealaltă aplicație și încearcă din nou.', 'error');
    } else {
      // Necunoscut: spunem ce a spus browserul, nu ce bănuim noi. O cauză inventată trimite omul
      // să repare ce nu e stricat.
      setStatus(`Nu am acces la microfon (${nume || 'motiv necunoscut'}).`, 'error');
    }
    return;
  }

  // Două contexte, fiindcă ratele diferă: 16 kHz la captură, 24 kHz la redare. Rata cerută e
  // doar o sugestie — dacă browserul o ignoră, worklet-ul reeșantionează el (vezi capture-worklet.js).
  // Dacă microfonul fusese refuzat și omul a dat acces între timp din Setări, linia din sertar
  // trebuie să înceteze să mai ceară ceva. Aici e singurul loc care ȘTIE sigur că merge.
  arataAccesulLaMicrofon(true);

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
      if (message.status === 'ready') {
        setStatus('Te ascult.', 'live');
        // Și după o reconectare: acolo orbul a trecut pe „conectare", iar `Orb.conecteaza` (care
        // îl pune pe „activ") se cheamă o singură dată, la începutul apelului.
        if (inCall) Orb.stare('activ');
      }
      else if (message.status === 'connecting') setStatus('Mă conectez…', 'busy');
      else if (message.status === 'turn_complete') lastBubble = null;
      // Reconectare: apelul NU s-a terminat. Worker-ul reface legătura cu handle-ul de reluare,
      // iar microfonul continuă să înregistreze — ce spui între timp nu se pierde. Și nu e
      // liniște: dacă am lăsa ceasul să curgă, apelul s-ar închide exact în timpul reparației.
      else if (message.status === 'reconnecting') {
        setStatus('Refac legătura…', 'busy');
        semnDeViata();
        // Se reface legătura, nu se mai lucrează la nimic: orbul trebuie să arate ce se întâmplă
        // ACUM, altfel ar rămâne chihlimbariu pe un apel care se repară.
        iesiDinLucru();
        if (inCall) Orb.stare('conectare');
      }
      break;
    case 'transcript':
      semnDeViata();
      // Gemini vorbește adesea în timp ce uneltele încă lucrează („o clipă, mă uit"). Un orb
      // care nu reacționează la voce exact atunci arată stricat, deci prima vorbă a
      // asistentului scoate din „lucrează" — asta e ieșirea obișnuită, nu excepția.
      if (message.role === 'assistant') iesiDinLucru();
      appendTranscript(message.role, message.text);
      break;
    case 'tools': {
      // Cât lucrează o unealtă, ceasul de liniște primește un răgaz mai lung (vezi ragazLiniste).
      ultimaUnealta = Date.now();
      semnDeViata();
      const ce = descrieUnelte(message.names);
      setStatus(`${ce.charAt(0).toUpperCase()}${ce.slice(1)}…`, 'busy');
      note(ce);
      intraInLucru();
      break;
    }
    case 'tools_gata':
      iesiDinLucru();
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
  clearTimeout(ceasUnealta);
  ceasUnealta = null;
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
  setStatus('Atinge cercul ca să vorbim.', '');
  lastBubble = null;
}

// ─── Sertarul cu comenzi ───────────────────────────────────────────────────────────────
//
// Ecranul rămâne gol: doar orbul. Tot ce e buton (microfon, transcriere, scris, închide) stă
// într-un sertar pe marginea din dreapta, care se deschide de pe mâner sau cu o tragere de
// deget dinspre margine. Nu se ține minte deschis — starea normală a aplicației e închis.

function setMeniu(deschis) {
  els.meniu.dataset.deschis = deschis ? 'true' : 'false';
  els.meniu.setAttribute('aria-hidden', deschis ? 'false' : 'true');
  els.voal.dataset.deschis = deschis ? 'true' : 'false';
  els.maner.setAttribute('aria-expanded', deschis ? 'true' : 'false');

  if (deschis && !istoricIncarcat) {
    istoricIncarcat = true;
    incarcaIstoricPeEcran();
  }
}

// ─── Ce s-a vorbit înainte ─────────────────────────────────────────────────────────────
//
// Transcrierea trăia doar în DOM, deci dispărea la fiecare reîncărcare a paginii — aplicația
// părea amnezică deși creierul nu e: tot ce se spune, în apel sau pe Telegram, e în SQL-ul
// agentului. Aici se aduce înapoi pe ecran.
//
// E ACELAȘI istoric cu cel din Telegram (un singur agent, regula 24), deci în sertar apar și
// conversațiile scrise. De-aia mesajele de pe Telegram se și marchează: altfel ar părea că
// apelul de acum conține lucruri care nu s-au spus niciodată cu voce.

async function incarcaIstoricPeEcran() {
  if (!els.istoric) return;

  const token = getTokenSalvat() || (await cheieDinAplicatie());
  if (!token) return;

  try {
    const raspuns = await fetch(
      `https://${gazdaServer()}/voice-history?token=${encodeURIComponent(token)}&limit=40`
    );
    if (!raspuns.ok) throw new Error(`istoric ${raspuns.status}`);

    const { mesaje } = await raspuns.json();
    // Fără istoric, cutia rămâne ascunsă cu totul: un „nimic încă" ar fi un rând care ocupă loc
    // ca să nu spună nimic. La prima conversație, sertarul arată doar apelul de acum.
    if (!mesaje || mesaje.length === 0) return;

    els.istoric.hidden = false;
    if (els.separatorAcum) els.separatorAcum.hidden = false;
    els.istoric.innerHTML = '';
    for (const m of mesaje) {
      const bula = document.createElement('p');
      bula.className = 'bubble';
      bula.dataset.role = m.role;
      if (m.canal) bula.dataset.canal = m.canal;
      bula.textContent = m.text;
      // Eticheta e text, nu doar o culoare de chenar: „pe Telegram" se citește și de cineva
      // care n-ar distinge nuanțele (același principiu ca tăietura de pe microfonul oprit).
      if (m.canal === 'telegram') {
        const eticheta = document.createElement('span');
        eticheta.className = 'canal';
        eticheta.textContent = 'pe Telegram';
        bula.appendChild(eticheta);
      }
      els.istoric.appendChild(bula);
    }
    // Sertarul se deschide pe ce s-a vorbit ultima dată, nu pe începutul de acum o săptămână.
    els.istoric.scrollTop = els.istoric.scrollHeight;
  } catch (err) {
    // Un rând discret ÎN container, niciodată pe linia de status: acolo stau erorile apelului,
    // iar un istoric nereușit n-are voie să acopere „Te ascult.".
    els.istoric.hidden = false;
    els.istoric.innerHTML = '<p class="note">Nu am putut încărca ce s-a vorbit înainte.</p>';
  }
}

els.maner.addEventListener('click', () => setMeniu(true));
els.inchideMeniu.addEventListener('click', () => setMeniu(false));
els.voal.addEventListener('click', () => setMeniu(false));
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') setMeniu(false);
});

// Tragere dinspre marginea din dreapta: gestul pe care îl încearcă oricine, înainte să caute
// un buton. Doar pe orizontală și doar dacă pornește din ultimii 28 de pixeli — altfel ar
// prinde și derulările obișnuite din transcriere.
let atingereX = null;
let atingereY = null;
document.addEventListener(
  'touchstart',
  (ev) => {
    const t = ev.touches[0];
    atingereX = window.innerWidth - t.clientX < 28 ? t.clientX : null;
    atingereY = t.clientY;
  },
  { passive: true }
);
document.addEventListener(
  'touchmove',
  (ev) => {
    if (atingereX === null) return;
    const t = ev.touches[0];
    const dx = atingereX - t.clientX;
    const dy = Math.abs(atingereY - t.clientY);
    if (dx > 40 && dy < 50) {
      setMeniu(true);
      atingereX = null;
    }
  },
  { passive: true }
);

els.mut.addEventListener('click', () => setMut(!mut));

els.call.addEventListener('click', () => {
  if (inCall) endCall();
  else startCall();
  setMeniu(false);
});

// Orbul ESTE butonul de apel: mic și cenușiu îl atingi ca să sune, mare și colorat îl atingi
// ca să închizi. (Pe telefon mai e o cale, fără atingere deloc: „Jarvis" — vezi mai jos.)
els.orbButon.addEventListener('click', () => {
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

  // Permisiunea se cere DUPĂ ce apelul a pornit — nu la încărcarea paginii.
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

// ─── WhatsApp (doar în aplicația nativă) ─────────────────────────────────────────────────
//
// Citirea și trimiterea se fac ÎN TELEFON, prin notificări (vezi WhatsAppListener.java). Aici
// nu e nimic din toate astea — doar comutatorul care duce la Setări, fiindcă accesul la
// notificări nu poate fi cerut printr-un dialog, ci doar acordat manual.

async function pregatesteWhatsapp() {
  const plugin = pluginApel();
  if (!plugin || !plugin.stareWhatsapp) return; // pe web, linia rămâne ascunsă
  els.whatsapp.hidden = false;
  try {
    const stare = await plugin.stareWhatsapp();
    const areAcces = !!stare?.acces;
    // Când merge, e o simplă informație — inertă, fără nimic de apăsat. Devine apăsabilă doar
    // când lipsește accesul, fiindcă atunci chiar are unde să te ducă (Setări).
    els.whatsapp.disabled = areAcces;
    els.whatsapp.textContent = areAcces
      ? 'WhatsApp — integrat'
      : 'WhatsApp — atinge ca să dai acces la notificări';
  } catch {
    /* pluginul e mai vechi decât pagina; linia rămâne pe „dă acces" */
    els.whatsapp.disabled = false;
    els.whatsapp.textContent = 'WhatsApp — atinge ca să dai acces la notificări';
  }
}

els.whatsapp.addEventListener('click', async () => {
  const plugin = pluginApel();
  if (!plugin || !plugin.cereAccesWhatsapp) return;
  // Starea se reverifică la revenirea în aplicație (evenimentul 'resume' de mai jos) — de aici
  // nu avem cum ști ce a apăsat omul în Setări.
  await plugin.cereAccesWhatsapp().catch(() => {});
});

pregatesteWhatsapp();

// ─── Microfonul refuzat ──────────────────────────────────────────────────────────────────
//
// Odată refuzată, permisiunea de microfon NU se mai poate cere printr-un dialog: Android (ca și
// browserul) întoarce refuzul instant, fără să întrebe pe nimeni. Deci apăsarea orbului repetă
// la nesfârșit același mesaj și nu există nicio cale înainte — exact situația de la accesul la
// notificări (regula 49), și se rezolvă la fel: o linie care duce în Setări.
//
// Pe web nu există unde duce (fiecare browser își ține permisiunile în alt loc), deci acolo
// linia rămâne ascunsă, iar textul de status spune ce e de apăsat.

function arataAccesulLaMicrofon(areAcces) {
  if (!els.microfonAcces) return;
  const plugin = pluginApel();
  if (!plugin || !plugin.deschideSetarileAplicatiei) return; // pe web sau pe un APK vechi

  // Linia apare DOAR după un refuz. Spre deosebire de cea de WhatsApp — unde cerința a fost
  // „vreau să știu că e integrat" — nimeni n-a cerut să vadă în sertar că microfonul merge;
  // un rând care spune că totul e în regulă e doar zgomot.
  if (areAcces && els.microfonAcces.hidden) return;

  els.microfonAcces.hidden = false;
  els.microfonAcces.disabled = areAcces;
  els.microfonAcces.textContent = areAcces
    ? 'Microfon — are acces'
    : 'Microfon — atinge ca să dai acces din Setări';
}

if (els.microfonAcces) {
  els.microfonAcces.addEventListener('click', async () => {
    const plugin = pluginApel();
    if (!plugin || !plugin.deschideSetarileAplicatiei) return;
    await plugin.deschideSetarileAplicatiei().catch(() => {});
  });
}

// ─── Haptic ──────────────────────────────────────────────────────────────────────────────
//
// Confirmarea că apelul chiar a pornit, când telefonul e în buzunar sau în suport, în mașină.
// Două tipare diferite, nu unul: un bâzâit identic ar spune că S-A ÎNTÂMPLAT ceva, nu CE s-a
// întâmplat — iar tot rostul lui e să știi starea fără să te uiți la ecran.
function vibra(tip) {
  const plugin = pluginApel();
  if (plugin && plugin.vibra) {
    plugin.vibra({ tip }).catch(() => {});
    return;
  }
  // Retragere pe web (absentă tăcut pe iOS, unde `navigator.vibrate` nu există).
  if (navigator.vibrate) navigator.vibrate(tip === 'inceput' ? 40 : [25, 60, 25]);
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
    pregatesteWhatsapp();
    if (!inCall && (await deschisaPentruApel())) startCall();
  });
}
