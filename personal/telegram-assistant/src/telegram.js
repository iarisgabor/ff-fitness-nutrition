const TELEGRAM_API_BASE = 'https://api.telegram.org';

export function verifyTelegramSecret(request, env) {
  const header = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  return !!header && header === (env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

export function isAllowedUser(update, env) {
  const fromId = update?.message?.from?.id;
  if (fromId === undefined || fromId === null) return false;
  return String(fromId) === (env.ALLOWED_TELEGRAM_USER_ID || '').trim();
}

export function isPrivateTextMessage(update) {
  const message = update?.message;
  return !!message && message.chat?.type === 'private' && typeof message.text === 'string';
}

// Mesaj vocal (butonul de microfon din Telegram) SAU fișier audio trimis ca atașament. Ambele
// ajung în aceeași conversație și au aceeași intenție — `voice` e cel obișnuit, `audio` apare
// când trimiți un fișier din altă aplicație. `video_note` (mesajul rotund) e ignorat intenționat:
// are pistă audio, dar Telegram nu garantează un mime_type util și nu-l folosim în practică.
export function isPrivateVoiceMessage(update) {
  const message = update?.message;
  if (!message || message.chat?.type !== 'private') return false;
  return !!(message.voice || message.audio);
}

export function getVoicePayload(update) {
  const message = update?.message;
  const media = message?.voice || message?.audio;
  if (!media) return null;
  return { fileId: media.file_id, mimeType: media.mime_type || 'audio/ogg', duration: media.duration };
}

// Descarcă un fișier trimis de utilizator. Telegram cere doi pași: getFile (întoarce un file_path
// temporar, valabil ~1h) și apoi un GET pe host-ul de fișiere, care e DIFERIT de cel de API.
export async function downloadTelegramFile(env, fileId) {
  const botToken = (env.TELEGRAM_BOT_TOKEN || '').trim();

  const metaRes = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const meta = await metaRes.json().catch(() => null);
  if (!metaRes.ok || !meta?.ok || !meta.result?.file_path) {
    const err = new Error(`Telegram getFile failed (${metaRes.status})`);
    err.code = 'TELEGRAM_FILE_FAILED';
    throw err;
  }

  const fileRes = await fetch(`${TELEGRAM_API_BASE}/file/bot${botToken}/${meta.result.file_path}`);
  if (!fileRes.ok) {
    const err = new Error(`Telegram file download failed (${fileRes.status})`);
    err.code = 'TELEGRAM_FILE_FAILED';
    throw err;
  }

  return new Uint8Array(await fileRes.arrayBuffer());
}

// Indicatorul "înregistrează un mesaj vocal" / "scrie" din antetul conversației. Pur cosmetic, dar
// necesar: transcrierea + bucla de unelte durează câteva secunde, iar fără el botul pare mut.
// Expiră singur după ~5s, deci nu trebuie oprit explicit.
export async function sendChatAction(env, { chatId, action }) {
  const botToken = (env.TELEGRAM_BOT_TOKEN || '').trim();
  await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {});
}

// Trimite răspunsul ca mesaj vocal. `caption` merge alături ca text, ca să rămână și în scris —
// util când ești într-un loc unde nu poți asculta, și ca istoric căutabil în conversație.
export async function sendTelegramVoice(env, { chatId, audio, caption }) {
  const botToken = (env.TELEGRAM_BOT_TOKEN || '').trim();

  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('voice', new Blob([audio], { type: 'audio/mpeg' }), 'raspuns.mp3');
  if (caption) {
    // Telegram taie caption-ul la 1024 de caractere și respinge mesajul dacă e depășit.
    form.append('caption', caption.slice(0, 1024));
  }

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendVoice`, { method: 'POST', body: form });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const err = new Error(`Telegram sendVoice failed (${res.status}): ${detail}`);
    err.code = 'TELEGRAM_SEND_FAILED';
    throw err;
  }

  return res.json();
}

export async function sendTelegramMessage(env, { chatId, text }) {
  const botToken = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Fără parse_mode: nici Claude (scrie markdown cu **, nu tag-uri HTML), nici titlurile de
    // evenimente din Calendar (text liber, introdus de utilizator) nu garantează HTML valid —
    // parse_mode: 'HTML' ar respinge silențios mesajul întreg la primul `<`/`>` neașteptat
    // (TELEGRAM_SEND_FAILED nu are mesaj de eroare asociat, deci botul ar părea complet mut).
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const err = new Error(`Telegram sendMessage failed (${res.status}): ${detail}`);
    err.code = 'TELEGRAM_SEND_FAILED';
    throw err;
  }

  return res.json();
}
