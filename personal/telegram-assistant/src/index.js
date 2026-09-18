import { getAgentByName } from 'agents';
import { AssistantAgent } from './agent.js';
import { VoiceSession } from './voice/session.js';
import { ListenSession } from './voice/listen.js';
import { verifyTelegramSecret, isAllowedUser } from './telegram.js';

export { AssistantAgent, VoiceSession, ListenSession };

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

    // Legătura permanentă a telefonului (serviciul nativ din aplicația Android). Prin ea
    // Worker-ul poate SUNA telefonul, fără Firebase — vezi src/voice/listen.js.
    if (url.pathname === '/voice-listen') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Se așteaptă un WebSocket', { status: 426 });
      }
      const asteptat = (env.VOICE_ACCESS_TOKEN || '').trim();
      if (!asteptat || url.searchParams.get('token') !== asteptat) {
        return new Response('Unauthorized', { status: 401 });
      }
      // Numit pe utilizator, nu unic ca VoiceSession: telefonul are o singură legătură de
      // ascultare, iar agentul trebuie să o găsească după nume ca să trimită prin ea.
      const id = env.LISTEN_SESSION.idFromName(String((env.ALLOWED_TELEGRAM_USER_ID || '').trim()));
      return env.LISTEN_SESSION.get(id).fetch(request);
    }

    // Diagnostic: e telefonul conectat pe legătura permanentă? Fără asta, singurul simptom al
    // unei legături căzute e că notificările sosesc pe Telegram în loc de aplicație — ceea ce
    // arată identic cu „aplicația nu e instalată" și cu „tokenul nu a ajuns la serviciu".
    if (request.method === 'GET' && url.pathname === '/voice-listen/stare') {
      const asteptat = (env.VOICE_ACCESS_TOKEN || '').trim();
      if (!asteptat || url.searchParams.get('token') !== asteptat) {
        return new Response('Unauthorized', { status: 401 });
      }
      const id = env.LISTEN_SESSION.idFromName(String((env.ALLOWED_TELEGRAM_USER_ID || '').trim()));
      const conectat = await env.LISTEN_SESSION.get(id).eConectat();
      return new Response(JSON.stringify({ conectat }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // Notificări push — două rute, amândouă păzite de același token ca /voice-ws.
    //
    // `/voice-push/subscribe` — telefonul își lasă adresa la care poate fi găsit.
    // `/voice-push/pending`   — service worker-ul cere textul notificării TOCMAI primite.
    //   A doua există fiindcă trimitem semnale fără conținut (vezi src/push.js): telefonul e
    //   trezit, apoi întreabă ce avea de spus. Textul se consumă la citire, o singură dată.
    if (url.pathname === '/voice-push/subscribe' || url.pathname === '/voice-push/pending') {
      const expected = (env.VOICE_ACCESS_TOKEN || '').trim();
      if (request.method !== 'POST' || !expected || url.searchParams.get('token') !== expected) {
        return new Response('Unauthorized', { status: 401 });
      }

      const agent = await getAgentByName(
        env.ASSISTANT_AGENT,
        String((env.ALLOWED_TELEGRAM_USER_ID || '').trim())
      );

      if (url.pathname === '/voice-push/subscribe') {
        const subscription = await request.json().catch(() => null);
        if (!subscription || !subscription.endpoint) {
          return new Response('Abonament invalid', { status: 400 });
        }
        await agent.savePushSubscription(subscription);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      const pending = await agent.takePendingNotification();
      return new Response(JSON.stringify(pending || {}), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // Digital Asset Links — dovada că APK-ul și site-ul ăsta aparțin aceluiași proprietar.
    // Fără el, aplicația instalată din APK afișează bara de adrese a browserului deasupra
    // paginii (funcționează, dar nu arată a aplicație). Android îl citește o singură dată, la
    // instalare, de la exact această cale.
    //
    // Servit din Worker, nu ca fișier static: căile care încep cu punct pot fi tratate special
    // de serverul de fișiere, iar aici nu-mi permit „poate merge".
    //
    // Amprenta vine din cheia cu care e semnat APK-ul (o dă PWABuilder la construire) și se
    // pune în `TWA_FINGERPRINT` din wrangler.toml. Nu e secretă — fișierul e public prin design.
    if (request.method === 'GET' && url.pathname === '/.well-known/assetlinks.json') {
      const fingerprint = (env.TWA_FINGERPRINT || '').trim();
      const packageName = (env.TWA_PACKAGE_ID || '').trim();
      if (!fingerprint || !packageName) {
        return new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      return new Response(
        JSON.stringify([
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: packageName,
              sha256_cert_fingerprints: [fingerprint],
            },
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }
      );
    }

    // Apelul vocal (PWA-ul din public/voce/). Un WebSocket din browser nu poate purta headere
    // proprii, deci tokenul vine prin query string — e un secret aleatoriu, transportat peste TLS,
    // pentru un singur utilizator. Pagina statică rămâne publică (n-are secrete în ea); zidul e aici.
    if (url.pathname === '/voice-ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Se așteaptă un WebSocket', { status: 426 });
      }
      const expected = (env.VOICE_ACCESS_TOKEN || '').trim();
      if (!expected || url.searchParams.get('token') !== expected) {
        return new Response('Unauthorized', { status: 401 });
      }
      // Un obiect nou per apel: două apeluri simultane nu se calcă unul pe altul pe socket.
      const id = env.VOICE_SESSION.newUniqueId();
      return env.VOICE_SESSION.get(id).fetch(request);
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
