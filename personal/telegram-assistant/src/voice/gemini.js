// Helperi de protocol pentru Gemini Live API (BidiGenerateContent, WebSocket).
//
// Regula care ține tot proiectul coerent: Worker-ul rămâne creierul. Fișierul ăsta NU decide
// nimic despre comportamentul asistentului — doar traduce ce avem deja (promptul din
// `prompt.js`, uneltele din `tools/index.js`) în forma pe care o cere Gemini.
//
// Endpoint și forme de mesaje verificate în documentația Live API (vezi HANDOFF-VOCE.md).

import { buildSystemPrompt, buildDateContext } from '../prompt.js';
import { TOOL_DEFINITIONS } from '../tools/index.js';

// Schema e https://, NU wss://, deși e un WebSocket: în Workers conexiunea de ieșire se
// deschide cu `fetch()` + headerul Upgrade, iar fetch respinge wss:// din start
// ("Fetch API cannot load"). Headerul face upgrade-ul, nu schema. Documentația Gemini arată
// wss:// fiindcă presupune constructorul `new WebSocket`, care în Workers nu există.
const GEMINI_LIVE_URL =
  'https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// Formatele audio ale Live API: intrarea e PCM16 mono la 16 kHz, ieșirea PCM16 mono la 24 kHz.
// Nu sunt configurabile — clientul (public/voce/app.js) trebuie să respecte exact aceste rate.
export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;
export const INPUT_MIME_TYPE = `audio/pcm;rate=${INPUT_SAMPLE_RATE}`;

// Ce se adaugă la promptul existent când canalul e vocea. Promptul de bază spune "prin Telegram"
// și presupune text (liste, confirmări scrise). Nu-l rescriem — o singură sursă de adevăr —
// doar îi spunem modelului în ce mediu vorbește acum.
const VOICE_PROMPT_ADDENDUM = `

CANALUL DE ACUM: vorbești cu utilizatorul PRIN VOCE, într-o conversație în timp real (nu prin
Telegram, deși regulile de mai sus rămân identice). Adaptează forma răspunsului:
- Vorbește în propoziții care se ascultă bine. Fără markdown, fără liste cu bulinuțe, fără
  emoji, fără linkuri — nimic din ce nu se poate rosti.
- La o comandă, fii scurt. La o conversație adevărată, vorbește cât e nevoie — dar în voce
  monologul obosește, așa că lasă-i loc să intervină: spune o parte, apoi întreabă sau taci.
- Când ai de enumerat mai multe lucruri (evenimente, cântări, persoane), spune-le legat, în
  frază, maximum trei-patru; dacă sunt mai multe, spune câte sunt în total și oferă-te să le
  detaliezi.
- Orele se rostesc firesc ("la trei și jumătate"), nu ca text scris ("15:30").
- Confirmările cerute de regulile de mai sus (ștergeri, schimbări de status) se cer tot prin
  voce, într-o singură întrebare scurtă.
- Dacă nu ai înțeles ce ți s-a spus, cere să se repete, nu ghici — mai ales la nume proprii.
- Uneltele durează uneori câteva secunde. Spune un cuvânt scurt înainte ("o clipă", "verific")
  ca utilizatorul să nu creadă că s-a întrerupt apelul.
- Data și ora de mai jos sunt de la ÎNCEPUTUL apelului și îmbătrânesc pe parcurs. Pentru
  "peste zece minute" calculează de la ele, dar dacă o unealtă îți răspunde că ora e în trecut,
  ea îți spune în mesaj cât e ceasul acum — folosește ACEA oră, nu pe cea din context.
- Nu chema aceeași unealtă de două ori pentru aceeași cerere. Dacă prima reușește, ai terminat;
  a doua încercare nu face decât să producă o eroare pe care i-o raportezi degeaba.`;

// Gemini acceptă subsetul OpenAPI 3.0 de JSON Schema și respinge chei pe care Anthropic le
// tolerează. `additionalProperties` e cea care pică sigur (vezi HANDOFF-VOCE.md) — filtrăm
// pe listă albă, recursiv, ca să nu ne surprindă alta când se adaugă o unealtă nouă.
const ALLOWED_SCHEMA_KEYS = new Set([
  'type',
  'description',
  'enum',
  'items',
  'properties',
  'required',
  'format',
  'nullable',
]);

export function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!ALLOWED_SCHEMA_KEYS.has(key)) continue;

    if (key === 'type' && typeof value === 'string') {
      // Schema proto a lui Google e un enum (OBJECT, STRING, ...); numele lui exact e cu majuscule.
      out.type = value.toUpperCase();
    } else if (key === 'type' && Array.isArray(value)) {
      // Anthropic acceptă tipuri reunite (`type: ['number', 'null']` la temperatura AC-ului);
      // Gemini nu — acolo "poate lipsi" se exprimă prin `nullable: true` pe un tip unic.
      const concrete = value.find((t) => t !== 'null');
      out.type = String(concrete || 'string').toUpperCase();
      if (value.includes('null')) out.nullable = true;
    } else if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, sub]) => [name, toGeminiSchema(sub)])
      );
    } else if (key === 'items') {
      out.items = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// TOOL_DEFINITIONS (format Anthropic: name/description/input_schema) → functionDeclarations.
// Uneltele fără parametri (get_air_conditioner_state, list_service_types, ...) au
// `properties: {}`; acolo omitem complet `parameters`, fiindcă un OBJECT gol e respins.
export function toFunctionDeclarations(tools = TOOL_DEFINITIONS) {
  return tools.map((tool) => {
    const declaration = { name: tool.name, description: tool.description };
    const parameters = toGeminiSchema(tool.input_schema);
    if (parameters && parameters.properties && Object.keys(parameters.properties).length > 0) {
      declaration.parameters = parameters;
    }
    return declaration;
  });
}

export function geminiLiveUrl(env) {
  const key = (env.GEMINI_API_KEY || '').trim();
  return `${GEMINI_LIVE_URL}?key=${encodeURIComponent(key)}`;
}

// Cheia călătorește în query string (așa cere Gemini), deci ajunge în mesajul oricărei erori de
// rețea — iar un `console.error(err.stack)` ar scrie-o în logurile Cloudflare, de unde nu mai
// poate fi retrasă. Orice text care poate conține URL-ul trece pe-aici înainte de logare.
export function redactKey(value) {
  const text = typeof value === 'string' ? value : String(value?.stack || value || '');
  return text.replace(/([?&]key=)[^&\s"']+/gi, '$1REDACTED');
}

// Primul mesaj pe socket. Nu trimite nimic altceva până nu vine `setupComplete`.
//
// Data curentă: în calea Telegram se injectează în fiecare mesaj al utilizatorului, ca să nu
// strice cache-ul promptului (vezi prompt.js). Aici nu există cache de prompt și sesiunea ține
// cât un apel, deci o punem o singură dată, în systemInstruction.
// `options.voiceName` suprascrie vocea doar pentru sesiunea curentă (vine din `?voice=` pe
// /voice-ws). Vocea implicită rămâne cea din `wrangler.toml`.
export function buildSetupMessage(env, options = {}) {
  const model = (env.GEMINI_LIVE_MODEL || 'models/gemini-3.8-live').trim();
  const voiceName = (options.voiceName || env.GEMINI_VOICE_NAME || 'Puck').trim();
  const generationConfig = {
    responseModalities: ['AUDIO'],
    speechConfig: {
      languageCode: (env.GEMINI_VOICE_LANGUAGE || 'ro-RO').trim(),
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName },
      },
    },
  };

  const setup = {
    model: model.startsWith('models/') ? model : `models/${model}`,
    generationConfig,
    systemInstruction: {
      parts: [
        { text: `${buildSystemPrompt(env)}${VOICE_PROMPT_ADDENDUM}\n\n${buildDateContext(env)}` },
      ],
    },
    tools: [{ functionDeclarations: toFunctionDeclarations() }],
    // Transcrierea ambelor sensuri — o folosim ca istoricul vocal să ajungă în același tabel
    // `messages` ca mesajele din Telegram (vezi agent.js).
    inputAudioTranscription: {},
    outputAudioTranscription: {},

    // Cele două motive pentru care o sesiune Live moare singură, și antidotul fiecăruia:
    //
    // 1. Fereastra de context se umple (audio-ul consumă mult) → sesiunea e terminată.
    //    `contextWindowCompression` cu fereastră glisantă taie automat coada veche, deci
    //    conversația poate continua oricât. Fără ea, un apel lung se închide de la sine.
    contextWindowCompression: { slidingWindow: {} },
    //
    // 2. Durata maximă a unei conexiuni. Aici nu există antidot — dar cu `sessionResumption`
    //    serverul trimite periodic un `handle`, iar o conexiune NOUĂ pornită cu handle-ul ăla
    //    continuă aceeași conversație, cu tot ce s-a vorbit. Reconectarea o face Worker-ul,
    //    fără să atingă socketul dinspre browser — vezi reconectare() în session.js.
    sessionResumption: options.resumeHandle ? { handle: options.resumeHandle } : {},
  };

  // Documentația „get started with WebSockets" pune responseModalities direct sub `setup`,
  // referința de schemă îl are în generationConfig. Dacă API-ul respinge varianta implicită,
  // pune GEMINI_MODALITIES_IN_SETUP = "1" în wrangler.toml — fără schimbare de cod.
  if ((env.GEMINI_MODALITIES_IN_SETUP || '').trim() === '1') {
    delete generationConfig.responseModalities;
    setup.responseModalities = ['AUDIO'];
  }

  return { setup };
}

// Fiecare mesaj de la client are EXACT una din cheile setup / clientContent / realtimeInput /
// toolResponse. Funcțiile de mai jos există ca să nu se amestece din greșeală.

export function buildAudioChunkMessage(base64Pcm) {
  return { realtimeInput: { audio: { data: base64Pcm, mimeType: INPUT_MIME_TYPE } } };
}

export function buildTextTurnMessage(text) {
  return {
    clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true },
  };
}

// Istoricul conversațiilor anterioare, încărcat la începutul apelului ca modelul să știe ce
// s-a vorbit înainte — inclusiv pe Telegram, fiindcă e același tabel `messages`.
// `turnComplete: false` e esențial: pune turele în context FĂRĂ să ceară un răspuns.
// Rolul modelului se numește `model` la Gemini, nu `assistant` ca la Anthropic.
export function buildHistoryMessage(rows) {
  const turns = rows
    .filter((row) => typeof row.content === 'string' && row.content.trim())
    .map((row) => ({
      role: row.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: row.content }],
    }));
  if (turns.length === 0) return null;
  return { clientContent: { turns, turnComplete: false } };
}

// Răspunsul la un toolCall merge prin toolResponse, NU prin clientContent. `id` trebuie să fie
// exact id-ul primit în functionCalls.
export function buildToolResponseMessage(functionResponses) {
  return { toolResponse: { functionResponses } };
}

// Gemini se așteaptă ca `response` să fie un obiect. Uneltele noastre întorc obiecte, dar
// aruncă excepții la eroare — le împachetăm, ca sesiunea să nu cadă pentru o unealtă care a dat greș.
export function buildFunctionResponse(call, result) {
  return { id: call.id, name: call.name, response: result };
}

export function buildFunctionErrorResponse(call, error) {
  return {
    id: call.id,
    name: call.name,
    response: { error: String(error?.message || error || 'Eroare necunoscută') },
  };
}
