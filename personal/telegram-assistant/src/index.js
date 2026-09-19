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

    // Autorizarea Spotify — se face O SINGURĂ DATĂ, din browser, și abia apoi merg uneltele.
    //
    // De ce aici și nu prin OAuth Playground (cum s-a luat refresh token-ul de Google):
    // Spotify nu are un playground, iar adresa de redirect trebuie să fie una pe care o
    // controlezi. Worker-ul e deja acea adresă, deci cele două rute de mai jos sunt tot ce
    // trebuie. Nimic nu se salvează pe server: pagina de la final arată refresh token-ul, iar
    // el se pune cu mâna ca secret, ca toate celelalte.
    if (request.method === 'GET' && url.pathname === '/spotify/auth') {
      const asteptat = (env.VOICE_ACCESS_TOKEN || '').trim();
      if (!asteptat || url.searchParams.get('token') !== asteptat) {
        return new Response('Unauthorized', { status: 401 });
      }

      const clientId = (env.SPOTIFY_CLIENT_ID || '').trim();
      if (!clientId) return new Response('Lipsește SPOTIFY_CLIENT_ID.', { status: 500 });

      const redirect = `${url.origin}/spotify/callback`;
      const scopes = [
        // Cine e utilizatorul. NU e optional: fara `user-read-private`, `/me` intoarce raspunsul
        // FARA campurile `product` si `country` — adica exact cele doua pe care ne bazam ca sa
        // stim daca e Premium si in ce piata cautam. Lipsa lor nu da nicio eroare, doar campuri
        // absente, deci contul unui abonat Premium arata identic cu unul gratuit.
        'user-read-private',
        // Playlisturi: create și umplute. Merg și pe cont gratuit.
        'playlist-modify-private',
        'playlist-modify-public',
        'playlist-read-private',
        // Ce cântă acum + control. Astea cer Premium ca să și funcționeze.
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
      ].join(' ');

      const autorizare = new URL('https://accounts.spotify.com/authorize');
      autorizare.searchParams.set('client_id', clientId);
      autorizare.searchParams.set('response_type', 'code');
      autorizare.searchParams.set('redirect_uri', redirect);
      autorizare.searchParams.set('scope', scopes);
      // Tokenul călătorește prin `state` fiindcă Spotify ne întoarce pe /spotify/callback,
      // unde nu mai avem cum să-l cerem — e singurul lucru care leagă cele două rute.
      autorizare.searchParams.set('state', asteptat);

      return Response.redirect(autorizare.toString(), 302);
    }

    if (request.method === 'GET' && url.pathname === '/spotify/callback') {
      const asteptat = (env.VOICE_ACCESS_TOKEN || '').trim();
      if (!asteptat || url.searchParams.get('state') !== asteptat) {
        return new Response('Unauthorized', { status: 401 });
      }

      const cod = url.searchParams.get('code');
      if (!cod) {
        return new Response(`Spotify a refuzat: ${url.searchParams.get('error') || 'fără cod'}`, {
          status: 400,
        });
      }

      const id = (env.SPOTIFY_CLIENT_ID || '').trim();
      const secret = (env.SPOTIFY_CLIENT_SECRET || '').trim();
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: cod,
          redirect_uri: `${url.origin}/spotify/callback`,
        }).toString(),
      });

      const date = await res.json().catch(() => null);
      if (!res.ok || !date?.refresh_token) {
        return new Response(`Schimbul de token a eșuat: ${JSON.stringify(date)}`, { status: 500 });
      }

      // Salvat direct în agent, nu afișat ca să-l lipești înapoi cu mâna: token-ul e deja
      // aici, în Worker, în momentul ăsta. Drumul dus-întors prin ecran n-ar adăuga nimic în
      // afară de ocazia unei greșeli de copiere.
      const agent = await getAgentByName(
        env.ASSISTANT_AGENT,
        String((env.ALLOWED_TELEGRAM_USER_ID || '').trim())
      );
      await agent.salveazaSpotifyToken(date.refresh_token);

      return new Response(
        'Gata — Spotify e legat de Jarvis.\n\n' +
          'Poți închide pagina. Cere-i „ce cântă acum?" sau „fă-mi un playlist de lucru".',
        { headers: { 'content-type': 'text/plain; charset=utf-8' } }
      );
    }

    // Mesajele WhatsApp văzute de telefon în notificări (vezi WhatsAppListener.java).
    // Telefonul le ÎMPINGE aici; Worker-ul nu întreabă niciodată telefonul, fiindcă telefonul
    // poate fi în buzunar, cu ecranul stins — legătura se deschide întotdeauna dinspre el.
    if (url.pathname === '/whatsapp/mesaj') {
      const asteptat = (env.VOICE_ACCESS_TOKEN || '').trim();
      if (request.method !== 'POST' || !asteptat || url.searchParams.get('token') !== asteptat) {
        return new Response('Unauthorized', { status: 401 });
      }

      const mesaj = await request.json().catch(() => null);
      if (!mesaj || !mesaj.expeditor || !mesaj.text) {
        return new Response('Mesaj invalid', { status: 400 });
      }

      const agent = await getAgentByName(
        env.ASSISTANT_AGENT,
        String((env.ALLOWED_TELEGRAM_USER_ID || '').trim())
      );
      const rezultat = await agent.salveazaMesajWhatsapp(mesaj);
      return new Response(JSON.stringify(rezultat), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // Notificări push — două rute, amândouă păzite de același token ca /voice-ws.
    //
    // `/voice-push/subscribe` — telefonul își lasă adresa la care poate fi găsit.
    // `/voice-push/pending`   — service worker-ul cere textul notificării TOCMAI primite.
    //   A doua există fiindcă trimitem semnale fără conținut (vezi src/push.js): telefonul e
    //   trezit, apoi întreabă ce avea de spus. Textul se consumă la citire, o singură dată.
    // Istoricul conversației, pentru sertarul din PWA. Aceeași poartă ca la /voice-push/* și ca
    // la /voice-ws: tokenul în query string (pagina nu poate pune headere pe un WebSocket, iar
    // restul rutelor ei folosesc deja forma asta).
    //
    // Răspunsul conține conversație reală, deci nu are voie să ajungă în cache-ul service
    // worker-ului — vezi garda din public/voce/sw.js, care sare peste rutele Worker-ului.
    if (url.pathname === '/voice-history') {
      const expected = (env.VOICE_ACCESS_TOKEN || '').trim();
      if (request.method !== 'GET' || !expected || url.searchParams.get('token') !== expected) {
        return new Response('Unauthorized', { status: 401 });
      }

      const agent = await getAgentByName(
        env.ASSISTANT_AGENT,
        String((env.ALLOWED_TELEGRAM_USER_ID || '').trim())
      );
      const limita = Math.min(Math.max(Number(url.searchParams.get('limit')) || 40, 1), 100);
      const mesaje = await agent.istoricPentruEcran(limita);

      return new Response(JSON.stringify({ mesaje }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }

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

    // Aceeași poartă, pentru măturarea de mementouri. Există ca să se poată TESTA: altfel fiecare
    // verificare a unei schimbări din zona asta ar costa o așteptare de 20 de minute, iar un
    // mecanism care se testează greu ajunge repede unul care nu se mai testează deloc.
    // Măturarea își reprogramează singură următoarea rulare, deci o chemare manuală nu rupe lanțul
    // — doar îl grăbește (și mai adaugă o programare, care se consumă normal).
    if (request.method === 'POST' && url.pathname === '/internal/verifica-memento') {
      if (request.headers.get('X-Internal-Secret') !== (env.INTERNAL_ADMIN_SECRET || '').trim()) {
        return new Response('Unauthorized', { status: 401 });
      }
      const agent = await getAgentByName(
        env.ASSISTANT_AGENT,
        String((env.ALLOWED_TELEGRAM_USER_ID || '').trim())
      );
      await agent.verificaMementouri();
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
