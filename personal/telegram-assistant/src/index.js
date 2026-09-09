import { getAgentByName } from 'agents';
import { AssistantAgent } from './agent.js';
import { verifyTelegramSecret, isAllowedUser } from './telegram.js';

export { AssistantAgent };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Pagină de start — necesară ca "Application home page" pe OAuth consent screen-ul din Google
    // Cloud Console. Numele afișat aici trebuie să coincidă cu numele aplicației configurat pe
    // consent screen ("Telegram_asistant"), altfel verificarea Google respinge homepage-ul.
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(
        `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<title>Telegram_asistant</title>
<meta name="google-site-verification" content="gvzm5LekmjnGFYbtAjvCIIosJ_5AlpxnSjH1s5ILedI">
</head>
<body>
<h1>Telegram_asistant</h1>
<p>Telegram_asistant este un asistent personal pe Telegram, folosit de un singur utilizator autorizat
(dezvoltatorul aplicației). Nu este o aplicație publică.</p>
<h2>Ce face</h2>
<ul>
<li>Răspunde la mesaje trimise pe Telegram folosind Claude (Anthropic).</li>
<li>Creează, caută, modifică și șterge evenimente în Google Calendar-ul utilizatorului autorizat, la cerere.</li>
<li>Trimite automat, o dată pe zi, agenda evenimentelor din ziua următoare.</li>
</ul>
<p><a href="/privacy">Politică de confidențialitate</a> · <a href="/terms">Termeni și condiții</a></p>
</body>
</html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
      );
    }

    // Politică de confidențialitate + Termeni — cerute de Google Cloud Console pe OAuth consent
    // screen odată ce aplicația folosește un scope "sensitive" (Calendar). Aplicația e strict
    // personală, cu un singur utilizator autorizat (ALLOWED_TELEGRAM_USER_ID).
    if (request.method === 'GET' && url.pathname === '/privacy') {
      return new Response(
        `Politică de confidențialitate — Telegram Assistant\n\n` +
          `Aceasta este o aplicație personală, cu un singur utilizator autorizat. Nu este disponibilă public.\n\n` +
          `Ce date colectează:\n` +
          `- Mesajele trimise botului pe Telegram, pentru a genera răspunsuri.\n` +
          `- Acces la Google Calendar (citire/scriere evenimente) al utilizatorului autorizat, ` +
          `pentru a crea, căuta, modifica și șterge evenimente și pentru a trimite agenda zilnică.\n\n` +
          `Cum sunt folosite datele:\n` +
          `Datele sunt folosite exclusiv pentru a răspunde utilizatorului și a gestiona calendarul acestuia. ` +
          `Nu sunt vândute, partajate sau folosite în alte scopuri.\n\n` +
          `Stocare: istoricul conversației este păstrat într-o bază de date privată (Cloudflare Durable Objects), ` +
          `accesibilă doar aplicației.\n\n` +
          `Contact: ${'iaris.gabor28@gmail.com'}`,
        { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
      );
    }

    if (request.method === 'GET' && url.pathname === '/terms') {
      return new Response(
        `Termeni și condiții — Telegram Assistant\n\n` +
          `Aceasta este o aplicație personală, cu un singur utilizator autorizat, oferită "ca atare", ` +
          `fără garanții. Este folosită exclusiv de dezvoltatorul aplicației pentru gestionarea propriului ` +
          `calendar Google prin Telegram.\n\n` +
          `Contact: ${'iaris.gabor28@gmail.com'}`,
        { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
      );
    }

    // Rută internă de administrare — declanșează manual agenda zilnică pentru un chat (util la
    // testare sau ca să retrimiți agenda la cerere). Protejată separat de webhook-ul Telegram.
    if (request.method === 'POST' && url.pathname === '/internal/run-daily-agenda') {
      if (request.headers.get('X-Internal-Secret') !== (env.INTERNAL_ADMIN_SECRET || '').trim()) {
        return new Response('Unauthorized', { status: 401 });
      }
      const chatId = url.searchParams.get('chatId') || env.ALLOWED_TELEGRAM_USER_ID;
      const agent = await getAgentByName(env.ASSISTANT_AGENT, String(chatId));
      await agent.cancelDailyAgendaSchedule();
      await agent.sendDailyAgenda();
      return new Response('OK', { status: 200 });
    }

    if (request.method !== 'POST' || url.pathname !== '/telegram-webhook') {
      return new Response('Not found', { status: 404 });
    }

    if (!verifyTelegramSecret(request, env)) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Clonăm ca să putem citi update-ul aici pentru filtrare, dar să trimitem request-ul
    // original (necitit) mai departe — Agent.onRequest citește el însuși body-ul, iar un
    // Request nu poate fi citit de două ori.
    const update = await request.clone().json().catch(() => null);

    // Actualizări non-message (edited_message, callback_query, channel_post, ...) — ignorate în v1.
    if (!update || !update.message) {
      return new Response('OK', { status: 200 });
    }

    // Botul nu trebuie să acționeze niciodată în grupuri.
    if (update.message.chat?.type !== 'private') {
      return new Response('OK', { status: 200 });
    }

    // Mereu 200 către Telegram, altfel Telegram reîncearcă livrarea — inclusiv pentru mesaje
    // respinse (nu de la utilizatorul autorizat), nu doar pentru cele procesate.
    if (!isAllowedUser(update, env)) {
      return new Response('OK', { status: 200 });
    }

    const agent = await getAgentByName(env.ASSISTANT_AGENT, String(update.message.chat.id));
    return agent.fetch(request);
  },
};
