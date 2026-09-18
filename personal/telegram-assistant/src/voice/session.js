// VoiceSession — Durable Object care ține un apel vocal: releu între WebSocket-ul browserului
// (PWA-ul din public/voce/) și WebSocket-ul Gemini Live, plus executarea uneltelor.
//
//   PWA  ──WS──►  VoiceSession  ──WS──►  Gemini Live
//                      │
//                      └── RPC ──► AssistantAgent.runVoiceTool() → cele 21 de unelte
//
// Gemini e doar urechi și gură. Promptul, uneltele și istoricul rămân ale Worker-ului.

import { DurableObject } from 'cloudflare:workers';
import { getAgentByName } from 'agents';
import {
  geminiLiveUrl,
  buildSetupMessage,
  buildAudioChunkMessage,
  buildTextTurnMessage,
  buildToolResponseMessage,
  buildFunctionResponse,
  buildFunctionErrorResponse,
  buildHistoryMessage,
  redactKey,
} from './gemini.js';

// Coduri de închidere: Workers acceptă 1000 sau intervalul 3000-4999 pe socket-ul către client.
const CLOSE_CONFIG = 4001; // lipsește o cheie / configurare greșită
const CLOSE_UPSTREAM = 4002; // Gemini a refuzat conexiunea sau a închis-o
const CLOSE_NORMAL = 1000;

// Peste atâtea reîncercări la rând fără o conexiune sănătoasă, renunțăm — altfel un serviciu
// căzut ar ține apelul "în reconectare" la nesfârșit, fără ca utilizatorul să afle.
const MAX_RECONECTARI = 5;
// Câte mesaje din istoric se pun în context la începutul apelului. Audio-ul consumă repede
// fereastra de context, deci nu exagerăm — 20 e cât ține și bucla de pe Telegram.
const ISTORIC_VOCE = 20;

function base64FromArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // În bucăți — String.fromCharCode cu zeci de mii de argumente deodată depășește stiva.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function arrayBufferFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export class VoiceSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.client = null;
    this.gemini = null;
    this.ready = false; // true după `setupComplete`
    this.closed = false;
    // Audio captat înainte ca Gemini să confirme setup-ul: se păstrează și se trimite după,
    // altfel primele cuvinte ale utilizatorului se pierd (microfonul pornește instant).
    this.pendingAudio = [];
    this.userTranscript = '';
    this.assistantTranscript = '';
    this.agentStub = null;
    this.audioIn = 0; // blocuri de microfon primite de la browser (diagnostic)
    this.loggedBadFrame = false;
    this.resumeHandle = null; // handle-ul de reluare a sesiunii, primit periodic de la Gemini
    this.reconectari = 0;
    this.reconectare = false;
    this.istoricIncarcat = false;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Se așteaptă un WebSocket', { status: 426 });
    }

    // Voce cerută doar pentru sesiunea asta (`?voice=`); fără ea rămâne cea din wrangler.toml.
    this.voiceName = new URL(request.url).searchParams.get('voice') || null;

    const pair = new WebSocketPair();
    const [clientSide, serverSide] = Object.values(pair);

    serverSide.accept();
    this.client = serverSide;

    serverSide.addEventListener('message', (event) => {
      this.onClientMessage(event.data).catch((err) => {
        console.error('VOICE_CLIENT_MESSAGE_ERROR', redactKey(err));
      });
    });
    serverSide.addEventListener('close', () => this.shutdown(CLOSE_NORMAL, 'client a închis'));
    serverSide.addEventListener('error', () => this.shutdown(CLOSE_NORMAL, 'eroare la client'));

    // Nu așteptăm conectarea la Gemini înainte de a întoarce răspunsul de upgrade — browserul
    // trebuie să primească socket-ul imediat; starea reală o află prin mesajul `status`.
    this.ctx.waitUntil(
      this.connectToGemini().catch((err) => {
        console.error('VOICE_GEMINI_CONNECT_ERROR', redactKey(err));
        this.toClient({ type: 'error', message: 'Nu m-am putut conecta la serviciul vocal.' });
        this.shutdown(CLOSE_UPSTREAM, 'conectare eșuată');
      })
    );

    return new Response(null, { status: 101, webSocket: clientSide });
  }

  // ─── Browser → aici ──────────────────────────────────────────────────────────────────────

  // Orice cadru care nu e text e un bloc de PCM16. NU testa `data instanceof ArrayBuffer`:
  // runtime-ul poate livra un Blob sau un ArrayBufferView, testul dă fals, iar audio-ul se
  // pierde fără nicio eroare — microfonul pare mort deși totul e în regulă. Aceeași capcană ca
  // pe partea Gemini (vezi decodeFrame).
  static async toArrayBuffer(data) {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (data && typeof data.arrayBuffer === 'function') return data.arrayBuffer();
    return null;
  }

  async onClientMessage(data) {
    if (typeof data !== 'string') {
      const buffer = await VoiceSession.toArrayBuffer(data);
      if (!buffer || buffer.byteLength === 0) {
        if (!this.loggedBadFrame) {
          this.loggedBadFrame = true;
          console.error('VOICE_CLIENT_FRAME_NEDECODAT', data?.constructor?.name || typeof data);
        }
        return;
      }
      this.audioIn += 1;
      // Doar prima dată și apoi rar — confirmă în `wrangler tail` că microfonul chiar ajunge,
      // fără să inunde logurile cu opt mesaje pe secundă.
      if (this.audioIn === 1 || this.audioIn % 50 === 0) {
        console.log('VOICE_AUDIO_IN', this.audioIn, 'tip=' + (data?.constructor?.name || typeof data), buffer.byteLength + ' octeti', 'gata=' + this.ready);
      }
      this.sendAudioToGemini(base64FromArrayBuffer(buffer));
      return;
    }

    let message = null;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (message.type === 'text' && message.text) {
      // Canal de rezervă: dacă microfonul nu merge, se poate scrie. Același agent, aceleași unelte.
      this.toGemini(buildTextTurnMessage(message.text));
      // Ce se scrie aici NU trece prin inputAudioTranscription (nu e audio), deci fără linia
      // asta mesajul nu ajunge niciodată în istoric: următorul apel ar ține minte doar ce a
      // răspuns asistentul, fără să știe la ce.
      this.ctx.waitUntil(
        this.getAgent()
          .then((agent) => agent.saveVoiceTranscript('user', message.text))
          .catch((err) => console.error('VOICE_TEXT_SAVE_ERROR', redactKey(err)))
      );
      return;
    }

    if (message.type === 'hangup') {
      this.shutdown(CLOSE_NORMAL, 'apel încheiat');
    }
  }

  sendAudioToGemini(base64Pcm) {
    if (!this.ready) {
      // Plafon de siguranță: ~10 s de audio (blocuri de ~128 ms). Peste atât, Gemini oricum
      // n-a răspuns și sesiunea e pierdută — nu umplem memoria DO-ului degeaba.
      if (this.pendingAudio.length < 80) this.pendingAudio.push(base64Pcm);
      return;
    }
    this.toGemini(buildAudioChunkMessage(base64Pcm));
  }

  // ─── Conexiunea spre Gemini ──────────────────────────────────────────────────────────────

  async connectToGemini() {
    if (!(this.env.GEMINI_API_KEY || '').trim()) {
      this.toClient({ type: 'error', message: 'Lipsește GEMINI_API_KEY pe Worker.' });
      this.shutdown(CLOSE_CONFIG, 'lipsește cheia');
      return;
    }

    // În Workers NU există constructorul `new WebSocket(url)` pentru ieșire — conexiunea se
    // deschide cu fetch + Upgrade, iar socket-ul vine pe `response.webSocket`.
    const response = await fetch(geminiLiveUrl(this.env), {
      headers: { Upgrade: 'websocket' },
    });

    const socket = response.webSocket;
    if (!socket) {
      const body = await response.text().catch(() => '');
      console.error('VOICE_GEMINI_NO_SOCKET', response.status, redactKey(body).slice(0, 500));
      this.toClient({ type: 'error', message: 'Serviciul vocal a refuzat conexiunea.' });
      this.shutdown(CLOSE_UPSTREAM, 'fără socket');
      return;
    }

    socket.accept();
    this.gemini = socket;

    socket.addEventListener('message', (event) => {
      this.onGeminiMessage(event.data).catch((err) => {
        console.error('VOICE_GEMINI_MESSAGE_ERROR', redactKey(err));
      });
    });
    // Orice închidere dinspre Gemini care nu e a noastră înseamnă reconectare, NU sfârșitul
    // apelului: socketul dinspre browser rămâne deschis, microfonul continuă să curgă în
    // `pendingAudio`, iar cu handle-ul de reluare conversația continuă de unde a rămas.
    socket.addEventListener('close', (event) => {
      console.log('VOICE_GEMINI_CLOSED', event.code, redactKey(event.reason));
      if (socket !== this.gemini) return; // socket vechi, deja înlocuit de o reconectare
      this.reconecteaza(event.reason || `cod ${event.code}`);
    });
    socket.addEventListener('error', () => {
      if (socket === this.gemini) this.reconecteaza('eroare de socket');
    });

    // Primul mesaj, obligatoriu. Nimic altceva nu se trimite până nu vine `setupComplete`.
    console.log(
      'VOICE_SETUP',
      'ceruta=' + this.voiceName,
      'env=' + this.env.GEMINI_VOICE_NAME,
      'reluare=' + (this.resumeHandle ? 'da' : 'nu')
    );
    socket.send(
      JSON.stringify(
        buildSetupMessage(this.env, {
          voiceName: this.voiceName,
          resumeHandle: this.resumeHandle,
        })
      )
    );
    this.toClient({ type: 'status', status: 'connecting' });
  }

  // Reconectare transparentă. Utilizatorul nu apasă nimic și, dacă totul merge, nici nu observă
  // altceva decât o pauză scurtă — de-aia clientul primește `reconnecting`, nu o eroare.
  async reconecteaza(motiv) {
    if (this.closed || this.reconectare) return;
    this.reconectare = true;
    this.ready = false;
    this.gemini = null;

    if (this.reconectari >= MAX_RECONECTARI) {
      console.error('VOICE_RECONECTARE_ABANDONATA', motiv, this.reconectari);
      this.toClient({ type: 'error', message: 'Conexiunea nu a putut fi refăcută. Sună din nou.' });
      this.reconectare = false;
      this.shutdown(CLOSE_UPSTREAM, 'reconectare eșuată');
      return;
    }

    this.reconectari += 1;
    console.log('VOICE_RECONECTARE', this.reconectari, motiv, 'handle=' + (this.resumeHandle ? 'da' : 'nu'));
    this.toClient({ type: 'status', status: 'reconnecting' });

    // Pauză crescătoare: la o cădere tranzitorie a serviciului (1011), o reconectare imediată
    // cade la fel de repede.
    await new Promise((gata) => setTimeout(gata, Math.min(500 * this.reconectari, 3000)));
    if (this.closed) {
      this.reconectare = false;
      return;
    }

    this.reconectare = false;
    await this.connectToGemini().catch((err) => {
      console.error('VOICE_RECONECTARE_EROARE', redactKey(err));
      this.reconecteaza('eroare la reconectare');
    });
  }

  // Gemini răspunde cu JSON, dar îl livrează ca frame binar. Ce tip concret ajunge aici depinde
  // de runtime, deci le acoperim pe toate — `new Uint8Array(blob)` dă tăcut un tablou gol, ceea
  // ce arată exact ca un mesaj gol și e greu de diagnosticat altfel.
  static async decodeFrame(data) {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (ArrayBuffer.isView(data)) {
      return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    }
    if (data && typeof data.text === 'function') return data.text(); // Blob
    if (data && typeof data.arrayBuffer === 'function') {
      return new TextDecoder().decode(await data.arrayBuffer());
    }
    return '';
  }

  async onGeminiMessage(data) {
    const text = await VoiceSession.decodeFrame(data);

    let message = null;
    try {
      message = JSON.parse(text);
    } catch {
      console.error(
        'VOICE_GEMINI_BAD_JSON',
        // Tipul cadrului, ca să știm ce n-am decodat dacă textul iese gol.
        data?.constructor?.name || typeof data,
        text.length,
        redactKey(text).slice(0, 300)
      );
      return;
    }

    if (message.setupComplete) {
      this.ready = true;
      this.reconectari = 0; // conexiune sănătoasă: bugetul de reîncercări se reface
      // La prima conectare încărcăm istoricul; la o reluare NU — handle-ul îl aduce cu el,
      // iar reîncărcarea ar dubla conversația.
      if (!this.istoricIncarcat) await this.incarcaIstoric();
      const buffered = this.pendingAudio;
      this.pendingAudio = [];
      for (const chunk of buffered) this.toGemini(buildAudioChunkMessage(chunk));
      this.toClient({ type: 'status', status: 'ready' });
      return;
    }

    // Handle-ul de reluare: Gemini îl trimite periodic, iar noi îl ținem minte. E singurul
    // lucru care face ca o reconectare să continue conversația în loc să o ia de la zero.
    if (message.sessionResumptionUpdate) {
      const handle = message.sessionResumptionUpdate.newHandle;
      if (handle) this.resumeHandle = handle;
      return;
    }

    if (message.toolCall) {
      await this.handleToolCall(message.toolCall);
      return;
    }

    if (message.goAway) {
      // Avertisment că actuala conexiune se termină (limita de durată a unei sesiuni Live).
      // Ne reconectăm din proprie inițiativă, înainte să cadă — așa pauza e minimă.
      console.log('VOICE_GOAWAY', JSON.stringify(message.goAway).slice(0, 120));
      this.reconecteaza('goAway');
      return;
    }

    if (message.serverContent) {
      this.handleServerContent(message.serverContent);
    }
  }

  handleServerContent(serverContent) {
    // Utilizatorul a vorbit peste model: aruncăm ce mai era de redat, altfel se aude o replică
    // la care el a renunțat deja.
    if (serverContent.interrupted) {
      this.toClient({ type: 'interrupted' });
    }

    const inputText = serverContent.inputTranscription?.text;
    if (inputText) {
      this.userTranscript += inputText;
      this.toClient({ type: 'transcript', role: 'user', text: inputText });
    }

    const outputText = serverContent.outputTranscription?.text;
    if (outputText) {
      this.assistantTranscript += outputText;
      this.toClient({ type: 'transcript', role: 'assistant', text: outputText });
    }

    for (const part of serverContent.modelTurn?.parts || []) {
      const audio = part.inlineData?.data;
      if (audio) {
        // Spre browser merge PCM brut, binar — fără base64, ca să nu creștem inutil traficul.
        this.toClientBinary(arrayBufferFromBase64(audio));
      }
    }

    if (serverContent.turnComplete) {
      this.ctx.waitUntil(this.flushTranscripts());
      this.toClient({ type: 'status', status: 'turn_complete' });
    }
  }

  // ─── Unelte ──────────────────────────────────────────────────────────────────────────────

  async handleToolCall(toolCall) {
    const calls = toolCall.functionCalls || [];
    if (calls.length === 0) return;

    this.toClient({ type: 'tools', names: calls.map((c) => c.name) });

    const responses = await Promise.all(
      calls.map(async (call) => {
        try {
          const agent = await this.getAgent();
          const result = await agent.runVoiceTool(call.name, call.args || {});
          return buildFunctionResponse(call, result);
        } catch (err) {
          console.error('VOICE_TOOL_ERROR', call.name, redactKey(err));
          // O unealtă căzută nu trebuie să pice apelul — modelul primește eroarea și o explică.
          return buildFunctionErrorResponse(call, err);
        }
      })
    );

    this.toGemini(buildToolResponseMessage(responses));
  }

  // Conversațiile anterioare, puse în context la începutul apelului. Fără asta, fiecare apel ar
  // porni cu memoria goală: n-ar ști ce i-ai povestit ieri și nici ce ați vorbit pe Telegram.
  async incarcaIstoric() {
    this.istoricIncarcat = true;
    try {
      const agent = await this.getAgent();
      const rows = await agent.getRecentHistory(ISTORIC_VOCE);
      const mesaj = buildHistoryMessage(rows);
      if (mesaj) {
        this.toGemini(mesaj);
        console.log('VOICE_ISTORIC', rows.length, 'mesaje');
      }
    } catch (err) {
      // Memoria e un plus, nu o condiție — apelul merge și fără ea.
      console.error('VOICE_ISTORIC_EROARE', redactKey(err));
    }
  }

  // Stub-ul agentului existent, pe ACELAȘI nume ca în Telegram (chat id-ul utilizatorului
  // autorizat) — așa conversația vocală și cea scrisă împart istoricul și starea.
  async getAgent() {
    if (!this.agentStub) {
      const name = String((this.env.ALLOWED_TELEGRAM_USER_ID || '').trim());
      this.agentStub = await getAgentByName(this.env.ASSISTANT_AGENT, name);
    }
    return this.agentStub;
  }

  async flushTranscripts() {
    const user = this.userTranscript.trim();
    const assistant = this.assistantTranscript.trim();
    this.userTranscript = '';
    this.assistantTranscript = '';
    if (!user && !assistant) return;

    try {
      const agent = await this.getAgent();
      if (user) await agent.saveVoiceTranscript('user', user);
      if (assistant) await agent.saveVoiceTranscript('assistant', assistant);
    } catch (err) {
      // Istoricul e util, nu esențial — o eroare aici nu întrerupe apelul.
      console.error('VOICE_TRANSCRIPT_SAVE_ERROR', redactKey(err));
    }
  }

  // ─── Trimitere / închidere ───────────────────────────────────────────────────────────────

  toClient(payload) {
    try {
      this.client?.send(JSON.stringify(payload));
    } catch {
      /* socket deja închis */
    }
  }

  toClientBinary(buffer) {
    try {
      this.client?.send(buffer);
    } catch {
      /* socket deja închis */
    }
  }

  toGemini(payload) {
    try {
      this.gemini?.send(JSON.stringify(payload));
    } catch (err) {
      console.error('VOICE_GEMINI_SEND_ERROR', redactKey(err));
    }
  }

  shutdown(code, reason) {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.pendingAudio = [];

    // Ce s-a vorbit până în momentul închiderii rămâne în istoric.
    this.ctx.waitUntil(this.flushTranscripts());

    try {
      this.gemini?.close(CLOSE_NORMAL, 'sesiune încheiată');
    } catch {
      /* deja închis */
    }
    try {
      this.client?.close(code, reason);
    } catch {
      /* deja închis */
    }
    this.gemini = null;
    this.client = null;
  }
}
