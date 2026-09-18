// ListenSession — legătura permanentă cu telefonul, pe care Worker-ul îl poate SUNA.
//
// Diferența față de VoiceSession: aia ține un apel (minute, trafic dens de audio). Asta stă
// deschisă zile întregi și nu transportă aproape nimic — doar evenimente rare, de câțiva octeți.
//
// De-aia folosește **WebSocket Hibernation** (`ctx.acceptWebSocket`), nu `accept()`: obiectul
// poate fi scos din memorie între evenimente, iar Cloudflare reține conexiunea și îl trezește
// când sosește ceva. Cu `accept()` obișnuit ar trebui ținut viu permanent — plătit la secundă
// și oprit oricum de platformă la un moment dat.
//
// Ocolește complet nevoia de Firebase: telefonul e deja conectat, deci „te sun" înseamnă un
// mesaj pe un socket deschis, nu un serviciu de notificări al altcuiva.

import { DurableObject } from 'cloudflare:workers';

export class ListenSession extends DurableObject {
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Se așteaptă un WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernare: NU `server.accept()`.
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // Telefonul trimite periodic un semn de viață; răspundem ca să nu creadă că legătura a murit.
  // Orice altceva se ignoră — canalul ăsta e într-un singur sens, de la server spre telefon.
  async webSocketMessage(ws, mesaj) {
    if (mesaj === 'ping') ws.send('pong');
  }

  async webSocketClose(ws, code) {
    console.log('LISTEN_INCHIS', code);
  }

  async webSocketError() {
    console.error('LISTEN_EROARE');
  }

  // Chemat prin RPC din AssistantAgent. Întoarce câte telefoane au primit evenimentul —
  // zero înseamnă că niciunul nu e conectat, iar apelantul trebuie să încerce altă cale.
  async trimiteEveniment(eveniment) {
    const conexiuni = this.ctx.getWebSockets();
    let livrate = 0;
    for (const ws of conexiuni) {
      try {
        ws.send(JSON.stringify(eveniment));
        livrate += 1;
      } catch {
        /* socket mort; Cloudflare îl curăță singur */
      }
    }
    return { livrate };
  }

  async eConectat() {
    return this.ctx.getWebSockets().length > 0;
  }
}
