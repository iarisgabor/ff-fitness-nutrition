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

// Cât așteptăm confirmarea telefonului la o comandă. Peste atât, presupunem că nu a ajuns:
// mai bine îi spunem omului „nu știu dacă a plecat" decât să-l lăsăm cu telefonul la ureche.
const ASTEPTARE_COMANDA_MS = 10000;

export class ListenSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Comenzi trimise, care așteaptă confirmare. Stau DOAR în memorie, și e în regulă: obiectul
    // nu hibernează cât timp are o cerere în curs, iar o comandă neconfirmată în 10 secunde e
    // pierdută oricum. Ce hibernează aici e socketul, nu așteptarea.
    this.asteptari = new Map();
  }

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
  // Singurul alt lucru pe care îl acceptăm dinspre telefon e confirmarea unei comenzi trimise
  // de noi — canalul rămâne, în rest, într-un singur sens.
  async webSocketMessage(ws, mesaj) {
    if (mesaj === 'ping') {
      ws.send('pong');
      return;
    }

    let raspuns = null;
    try {
      raspuns = JSON.parse(mesaj);
    } catch {
      return;
    }

    const rezolva = raspuns?.raspuns_la && this.asteptari.get(raspuns.raspuns_la);
    // `date` trece mai departe intact: unele comenzi au de raspuns mai mult decat da/nu — un
    // apel cu mai multi omonimi in agenda intoarce variantele, ca sa poata intreba asistentul.
    if (rezolva) {
      rezolva({ ok: !!raspuns.ok, motiv: raspuns.motiv || null, date: raspuns.date || null });
    }
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

  // O comandă e un eveniment care AȘTEAPTĂ un răspuns (spre deosebire de trimiteEveniment, care
  // doar anunță). Telefonul răspunde pe același socket cu { raspuns_la: <id>, ok, motiv }.
  async trimiteComanda(comanda) {
    const conexiuni = this.ctx.getWebSockets();
    if (conexiuni.length === 0) {
      return { ok: false, motiv: 'Telefonul nu e conectat. Deschide o dată aplicația pe telefon.' };
    }

    const id = crypto.randomUUID();
    const pachet = JSON.stringify({ ...comanda, id });

    let trimis = 0;
    for (const ws of conexiuni) {
      try {
        ws.send(pachet);
        trimis += 1;
      } catch {
        /* socket mort; Cloudflare îl curăță singur */
      }
    }
    if (trimis === 0) return { ok: false, motiv: 'Legătura cu telefonul e închisă.' };

    return new Promise((gata) => {
      const ceas = setTimeout(() => {
        this.asteptari.delete(id);
        gata({ ok: false, motiv: 'Telefonul nu a confirmat la timp.' });
      }, ASTEPTARE_COMANDA_MS);

      this.asteptari.set(id, (rezultat) => {
        clearTimeout(ceas);
        this.asteptari.delete(id);
        gata(rezultat);
      });
    });
  }
}
