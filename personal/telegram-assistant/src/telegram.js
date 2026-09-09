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
