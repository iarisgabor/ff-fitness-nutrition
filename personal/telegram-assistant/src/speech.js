// Voce: audio → text (STT) și text → audio (TTS).
//
// Modulul e deliberat agnostic de canal: nu știe nimic despre Telegram. Primește bytes, dă text;
// primește text, dă bytes. Asta ca să poată fi refolosit identic de orice altă "gură/ureche" care
// se leagă la asistent (număr de telefon, Home Assistant, aplicație proprie) — vezi ruta /ask din
// index.js, care e coloana comună.
//
// Alegerea furnizorului e implicită, nu configurabilă printr-un flag: dacă există cheie
// ElevenLabs, o folosim (3.1% WER pe română, față de ~12% mediu la Whisper — contează, fiindcă
// dictăm nume proprii: "Laviniu", "Chitară bas", titluri de evenimente). Dacă nu, cădem pe
// Workers AI, care nu cere niciun cont nou. Fără cheie ElevenLabs nu există TTS deloc și
// asistentul răspunde în text — vezi replyWithVoice din agent.js.

const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// Scribe v1 e modelul de transcriere; language_code îl scutește de ghicitul limbii, care pe
// fragmente scurte ("pornește aerul") greșește des și transcrie româna ca italiană.
const ELEVENLABS_STT_MODEL = 'scribe_v1';

// MP3, nu Opus: Telegram acceptă MP3 și M4A ca mesaj vocal (Bot API), iar MP3 e formatul la care
// toți furnizorii de TTS răspund identic. Opus ar fi nativ pentru sendVoice, dar nu merită riscul
// unui container greșit pentru un câștig de câțiva kilobytes.
const ELEVENLABS_TTS_FORMAT = 'mp3_44100_128';
const ELEVENLABS_TTS_MODEL = 'eleven_multilingual_v2';

// Workers AI. v3-turbo primește audio ca base64 (spre deosebire de `@cf/openai/whisper`, cel
// vechi, care cere array de octeți) și acceptă ogg — formatul în care Telegram trimite vocalele.
const WORKERS_AI_STT_MODEL = '@cf/openai/whisper-large-v3-turbo';

// Peste atâtea caractere nu mai citim răspunsul cu voce tare. Un răspuns lung (o listă de
// evenimente, un top de cântări) e ilizibil auditiv și scump la sintetizat — pe ăsta îl trimitem
// doar ca text. Limita e în caractere, nu în cuvinte, fiindcă asta facturează TTS-ul.
export const MAX_TTS_CHARS = 600;

function bytesToBase64(bytes) {
  // Chunk-uit: String.fromCharCode cu zeci de mii de argumente deodată depășește limita de
  // argumente a stivei și aruncă RangeError pe vocale mai lungi de câteva secunde.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function hasVoiceReply(env) {
  return !!(env.ELEVENLABS_API_KEY || '').trim();
}

async function transcribeWithElevenLabs(env, { bytes, mimeType }) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType || 'audio/ogg' }), 'voce.ogg');
  form.append('model_id', ELEVENLABS_STT_MODEL);
  form.append('language_code', (env.SPEECH_LANGUAGE || 'ro').trim());

  const res = await fetch(ELEVENLABS_STT_URL, {
    method: 'POST',
    headers: { 'xi-api-key': (env.ELEVENLABS_API_KEY || '').trim() },
    body: form,
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const error = new Error(`ElevenLabs STT failed (${res.status}): ${detail}`);
    error.code = 'STT_FAILED';
    throw error;
  }

  const data = await res.json();
  return (data.text || '').trim();
}

async function transcribeWithWorkersAi(env, { bytes }) {
  if (!env.AI) {
    const error = new Error('Nici ELEVENLABS_API_KEY, nici binding-ul AI nu sunt configurate.');
    error.code = 'STT_NOT_CONFIGURED';
    throw error;
  }

  const result = await env.AI.run(WORKERS_AI_STT_MODEL, {
    audio: bytesToBase64(bytes),
    language: (env.SPEECH_LANGUAGE || 'ro').trim(),
  });

  return (result?.text || '').trim();
}

// `bytes` = Uint8Array. Aruncă STT_FAILED / STT_NOT_CONFIGURED / STT_EMPTY (vezi ERROR_MESSAGES
// din agent.js).
export async function transcribe(env, { bytes, mimeType }) {
  const text = (env.ELEVENLABS_API_KEY || '').trim()
    ? await transcribeWithElevenLabs(env, { bytes, mimeType })
    : await transcribeWithWorkersAi(env, { bytes });

  if (!text) {
    const error = new Error('Transcrierea a ieșit goală.');
    error.code = 'STT_EMPTY';
    throw error;
  }

  return text;
}

// text → Uint8Array (MP3). Întoarce null dacă vocea nu e configurată sau textul e prea lung ca
// să merite citit — apelantul trimite atunci doar text, fără să trateze asta ca eroare.
export async function synthesize(env, { text }) {
  const apiKey = (env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) return null;
  if (!text || text.length > MAX_TTS_CHARS) return null;

  const voiceId = (env.ELEVENLABS_VOICE_ID || '').trim();
  if (!voiceId) return null;

  const url = `${ELEVENLABS_TTS_URL}/${encodeURIComponent(voiceId)}?output_format=${ELEVENLABS_TTS_FORMAT}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_TTS_MODEL,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const error = new Error(`ElevenLabs TTS failed (${res.status}): ${detail}`);
    error.code = 'TTS_FAILED';
    throw error;
  }

  return new Uint8Array(await res.arrayBuffer());
}
