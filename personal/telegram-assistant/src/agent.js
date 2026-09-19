import { Agent } from 'agents';
import { buildSystemPrompt, buildDateContext } from './prompt.js';
import { runToolLoop, rezumaConversatie } from './anthropic.js';
import { TOOL_DEFINITIONS, executeTool } from './tools/index.js';
import { listEventsForDate, listEventsBetween, getCalendarEvent } from './tools/calendar.js';
import { sendTelegramMessage, isPrivateTextMessage } from './telegram.js';
import { nextDailyRunAt, isoDateInTimeZone } from './datetime.js';
import { formatDailyAgenda } from './agenda.js';
import { runScheduledAcCommand } from './tools/air-conditioner.js';
import { sendPush } from './push.js';
import { FEREASTRA_CONFIRMARE_MS } from './tools/confirmare.js';

const HISTORY_WINDOW = 20;
const DAILY_AGENDA_CALLBACK = 'sendDailyAgenda';
const DAILY_AGENDA_MINUTE = 0;

// Mementourile: cât de des mătură calendarul, și numele celor două callback-uri de programare.
// Pasul de 20 de minute nu e precizia mementoului (alarma per eveniment sună la minut) — e doar
// cât de repede observăm un eveniment nou apărut în calendar.
const MEMENTO_PAS_MINUTE = 20;
const MEMENTO_SWEEP_CALLBACK = 'verificaMementouri';
const MEMENTO_CALLBACK = 'trimiteMementoEveniment';

// Mesaje prietenoase în română pentru codurile de eroare aruncate de anthropic.js/tools/calendar.js.
// `null` = nu are sens să trimitem un mesaj de eroare prin Telegram dacă tocmai trimiterea eșuează.
const ERROR_MESSAGES = {
  GOOGLE_AUTH_FAILED:
    'Nu m-am putut autentifica la Google Calendar. Verifică datele de acces (client id/secret/refresh token).',
  CALENDAR_INSERT_FAILED: 'Nu am reușit să creez evenimentul în Google Calendar. Încearcă din nou.',
  ANTHROPIC_API_ERROR: 'Am o problemă temporară la procesarea mesajului. Încearcă din nou în câteva momente.',
  ANTHROPIC_UNEXPECTED_STOP: 'A apărut o eroare neașteptată în răspunsul asistentului.',
  ANTHROPIC_TOO_MANY_ITERATIONS: 'Cererea a fost prea complexă pentru a fi procesată dintr-o dată. Reformuleaz-o.',
  CALENDAR_LIST_FAILED: 'Nu am reușit să citesc calendarul pentru agenda de mâine.',
  CALENDAR_UPDATE_FAILED: 'Nu am reușit să modific evenimentul în Google Calendar. Încearcă din nou.',
  CALENDAR_DELETE_FAILED: 'Nu am reușit să șterg evenimentul din Google Calendar. Încearcă din nou.',
  PLANNING_CENTER_AUTH_MISSING:
    'Planning Center nu e configurat încă (lipsesc credențialele). Verifică PLANNING_CENTER_APP_ID / PLANNING_CENTER_SECRET.',
  PLANNING_CENTER_AUTH_FAILED:
    'Nu m-am putut autentifica la Planning Center. Verifică App ID/Secret.',
  PLANNING_CENTER_REQUEST_FAILED: 'Nu am reușit să iau datele din Planning Center. Încearcă din nou.',
  ALEXA_AUTH_MISSING: 'Controlul aerului condiționat nu e configurat încă (lipsește ALEXA_REFRESH_TOKEN).',
  ALEXA_AUTH_FAILED: 'Sesiunea Alexa a expirat — trebuie refăcută logarea (vezi README, aer condiționat).',
  WEB_SEARCH_NOT_CONFIGURED: 'Căutarea pe net nu e configurată (lipsește cheia Anthropic).',
  WEB_SEARCH_FAILED: 'Nu am reușit să caut pe internet acum. Încearcă din nou.',
  WHATSAPP_SEND_FAILED: 'Nu am putut trimite mesajul pe WhatsApp — telefonul nu a răspuns.',
  SPOTIFY_NOT_CONFIGURED:
    'Spotify nu e conectat încă — trebuie făcută o dată autorizarea (vezi README).',
  SPOTIFY_AUTH_FAILED: 'Autorizarea Spotify a expirat. Trebuie refăcută o dată (vezi README).',
  SPOTIFY_PREMIUM_REQUIRED:
    'Controlul redării pe Spotify cere Premium. Căutarea și playlisturile merg oricum.',
  GMAIL_NOT_CONFIGURED:
    'Gmail nu e conectat încă — lipsesc GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN (vezi README).',
  GMAIL_AUTH_FAILED:
    'Nu m-am putut autentifica la Gmail. Verifică secretele GMAIL_* și scope-urile acordate la autorizare.',
  GMAIL_REQUEST_FAILED: 'Nu am reușit să citesc din Gmail acum. Încearcă din nou.',
  GMAIL_CIORNA_INCOMPLETA: 'Ciorna nu are destinatar sau text.',
  TELEGRAM_SEND_FAILED: null,
};

export class AssistantAgent extends Agent {
  async onStart() {
    this.sql`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS processed_updates (
        update_id INTEGER PRIMARY KEY,
        processed_at INTEGER DEFAULT (unixepoch())
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS agent_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `;
    // Mesajele WhatsApp citite de pe telefon (vezi tools/whatsapp.js). Tabel separat de
    // `messages`: alea sunt conversația CU asistentul, astea sunt corespondența altcuiva cu
    // utilizatorul — n-au ce căuta în istoricul trimis modelului la fiecare mesaj.
    this.sql`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cheie TEXT,
        expeditor TEXT NOT NULL,
        grup TEXT,
        text TEXT NOT NULL,
        poate_raspunde INTEGER DEFAULT 0,
        la INTEGER DEFAULT (unixepoch())
      )
    `;
    // Ce ține minte între conversații (vezi tools/memorie.js). Separat de `messages`: alea sunt
    // ce s-a spus, astea sunt ce a rămas adevărat. Istoricul se pierde după 20 de mesaje; faptele
    // nu se pierd niciodată, deci ele sunt singurul lucru pe care îl mai știe peste o lună.
    this.sql`
      CREATE TABLE IF NOT EXISTS fapte (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        sursa TEXT DEFAULT 'auto',
        creat_la INTEGER DEFAULT (unixepoch())
      )
    `;
    // Urma acțiunilor ireversibile (vezi tools/confirmare.js + tools/jurnal.js). `date_refacere`
    // e resursa întreagă a evenimentului șters, singura care se poate recrea; pentru un apel dat
    // sau un mesaj trimis rămâne NULL, fiindcă acolo nu există ce reface.
    this.sql`
      CREATE TABLE IF NOT EXISTS jurnal_actiuni (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unealta TEXT NOT NULL,
        rezumat TEXT NOT NULL,
        date_refacere TEXT,
        refacut_la INTEGER,
        la INTEGER DEFAULT (unixepoch())
      )
    `;
    // Versiunea corectă a unei cântări, ținută minte după ce a fost corectată o dată.
    //
    // De ce NU stă în `fapte`: tot ce e acolo intră în FIECARE cerere către model, la preț plin
    // (vezi comentariul din tools/memorie.js). Repertoriul unei biserici e de ordinul zecilor de
    // cântări — l-ai plăti și când vorbești despre aerul condiționat. Aici se citește doar în
    // clipa în care rulează spotify_reda.
    //
    // Și e altceva ca FORMĂ, nu doar ca loc: un fapt în limbaj natural („la «Mii de laude» e
    // versiunea de la X") l-ar obliga pe model să-l traducă înapoi într-o căutare de fiecare
    // dată — adică exact pasul unde greșește. Aici ținem URI-ul, care sare peste căutare cu
    // totul: fără ambiguitate, fără cover nimerit din greșeală, fără 5xx de la /search.
    //
    // Cheia e titlul NORMALIZAT (vezi normalizeazaTitlu), nu cel scris: „Mii de laude",
    // „mii de laude" și „Mii de Laude." trebuie să nimerească același rând.
    this.sql`
      CREATE TABLE IF NOT EXISTS piese_spotify (
        titlu TEXT PRIMARY KEY,
        uri TEXT NOT NULL,
        nume TEXT,
        artist TEXT,
        sursa TEXT DEFAULT 'corectat',
        creat_la INTEGER DEFAULT (unixepoch())
      )
    `;
    this.migreaza();
    await this.ensureDailyAgendaScheduled();
    await this.ensureMementoScheduled();
  }

  // Proiectul n-are mecanism de migrare: tabelele se creează cu `CREATE TABLE IF NOT EXISTS`, iar
  // asta ajunge cât timp doar ADAUGI tabele. O COLOANĂ nouă pe un tabel existent n-are echivalent
  // — `ALTER TABLE` aruncă dacă a rulat deja, iar `onStart` rulează la FIECARE trezire a DO-ului.
  //
  // Verificarea se face pe SCHEMA REALĂ, nu pe un flag de-al nostru în `agent_meta`. Un flag
  // spune doar ce credem noi că am făcut; dacă cele două se despart (flag scris, ALTER căzut),
  // fiecare INSERT de mai jos ar începe să arunce pe o coloană inexistentă, iar botul ar amuți
  // fără niciun semn. Aceeași lecție ca la butoanele de volum (regula 43d): întreabă sistemul.
  migreaza() {
    const coloane = this.sql`PRAGMA table_info(messages)`;
    if (!coloane.some((c) => c.name === 'canal')) {
      this.sql`ALTER TABLE messages ADD COLUMN canal TEXT`;
    }
  }

  // ─── agent_meta: citire/scriere ────────────────────────────────────────────────────────
  //
  // `agent_meta` e sacul de valori unice al agentului (flaguri de bootstrap, abonamentul push,
  // tokenul Spotify, sesiunea Alexa). Cele două helpere de mai jos sunt pentru cod NOU; metodele
  // vechi își păstrează SQL-ul propriu, fiindcă fiecare face și altceva pe lângă (JSON.parse cu
  // fallback, ștergere după citire).

  metaText(key) {
    const randuri = this.sql`SELECT value FROM agent_meta WHERE key = ${key}`;
    return randuri.length > 0 ? String(randuri[0].value ?? '') : '';
  }

  scrieMeta(key, value) {
    this.sql`
      INSERT INTO agent_meta (key, value) VALUES (${key}, ${String(value)})
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `;
  }

  // Pornește lanțul de auto-reprogramare o SINGURĂ dată, la bootstrap. Verificăm un flag
  // persistat în SQL (nu dacă există deja o programare "sendDailyAgenda") — dacă am verifica
  // programarea, ar exista o fereastră de cursă: onStart rulează la fiecare trezire, inclusiv
  // exact când alarma pentru sendDailyAgenda tocmai s-a declanșat, și nu știm sigur dacă rândul
  // ei mai există în acel moment. După bootstrap, doar sendDailyAgenda își mai reprogramează
  // singură următoarea rulare — un singur loc responsabil, fără risc de programări duplicate.
  async ensureDailyAgendaScheduled() {
    const flag = this.sql`SELECT value FROM agent_meta WHERE key = 'daily_agenda_bootstrapped'`;
    if (flag.length > 0) return;

    const timeZone = this.env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
    const hour = Number(this.env.DAILY_AGENDA_HOUR ?? 20);
    const next = nextDailyRunAt(timeZone, hour, DAILY_AGENDA_MINUTE);
    await this.schedule(next, DAILY_AGENDA_CALLBACK, {});
    this.sql`INSERT INTO agent_meta (key, value) VALUES ('daily_agenda_bootstrapped', '1')`;
  }

  // Anulează programarea curentă (dacă există) — folosit înainte de un declanșator manual
  // (ruta /internal/run-daily-agenda), ca sendDailyAgenda să nu ajungă să creeze o a doua
  // programare pentru aceeași zi, pe lângă cea deja existentă.
  async cancelDailyAgendaSchedule() {
    const existing = await this.listSchedules();
    for (const s of existing.filter((s) => s.callback === DAILY_AGENDA_CALLBACK)) {
      await this.cancelSchedule(s.id);
    }
  }

  // Rulează automat, o dată pe zi, la ora configurată — trimite pe Telegram agenda zilei
  // următoare, apoi își reprogramează singură următoarea rulare (calculul ține cont de ora de
  // vară/iarnă din nou de fiecare dată, nu presupune un offset UTC fix).
  async sendDailyAgenda() {
    const timeZone = this.env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
    const tomorrowIso = isoDateInTimeZone(new Date(), timeZone, 1);
    const dateLabel = tomorrowIso.split('-').reverse().join('.');

    try {
      const events = await listEventsForDate(this.env, tomorrowIso);
      const text = formatDailyAgenda(events, dateLabel);
      await sendTelegramMessage(this.env, { chatId: this.name, text });
    } catch (err) {
      const friendly = ERROR_MESSAGES[err.code] ?? 'Nu am reușit să trimit agenda zilei de mâine.';
      if (friendly) {
        await sendTelegramMessage(this.env, { chatId: this.name, text: friendly }).catch(() => {});
      }
    }

    const hour = Number(this.env.DAILY_AGENDA_HOUR ?? 20);
    const next = nextDailyRunAt(timeZone, hour, DAILY_AGENDA_MINUTE);
    await this.schedule(next, DAILY_AGENDA_CALLBACK, {});
  }

  // ─── Memento înainte de eveniment ──────────────────────────────────────────────────────
  //
  // Agenda zilnică spune seara ce ai mâine. Ce lipsea era vocea care te oprește cu o jumătate de
  // oră înainte — singurul moment în care informația mai poate schimba ceva.
  //
  // DOUĂ mecanisme, nu unul, fiindcă fiecare rezolvă altceva:
  //
  //  - o MĂTURARE la 20 de minute, care se uită în calendar și programează alarme. Nu se poate
  //    programa alarma la crearea evenimentului: calendarul nu e al nostru. Evenimentele apar,
  //    se mută și dispar din telefon, din web, din invitații primite — fără să treacă pe aici.
  //  - o ALARMĂ per eveniment, fiindcă dacă măturarea ar notifica direct, precizia mementoului ar
  //    fi precizia măturării: „cu 30 de minute înainte" ar însemna oriunde între 30 și 50.

  async ensureMementoScheduled() {
    if (this.metaText('memento_bootstrapped')) return;
    await this.schedule(new Date(Date.now() + 5000), MEMENTO_SWEEP_CALLBACK, {});
    this.scrieMeta('memento_bootstrapped', '1');
  }

  /**
   * Măturarea: ce începe în curând și n-are încă alarmă.
   *
   * Fereastra e `lead + un pas de măturare`, ca un eveniment apărut în calendar între două
   * măturări să nu scape: la fiecare rulare vedem tot ce începe în următoarele ~55 de minute.
   */
  async verificaMementouri() {
    const lead = Number(this.env.MEMENTO_MINUTE ?? 30);
    const acum = new Date();
    const sfarsit = new Date(acum.getTime() + (lead + MEMENTO_PAS_MINUTE + 5) * 60 * 1000);

    try {
      const evenimente = await listEventsBetween(this.env, acum, sfarsit);

      // `timeRange` se filtrează în SQL de către SDK; `callback` nu se poate filtra acolo, deci
      // rămâne în JS (la fel ca la agenda zilnică și la aerul condiționat).
      const programari = (await this.listSchedules({
        timeRange: { start: acum, end: sfarsit },
      })).filter((s) => s.callback === MEMENTO_CALLBACK);

      for (const ev of evenimente) {
        // Evenimentele „toată ziua" n-au un moment de la care să numeri înapoi, iar un memento
        // la 30 de minute după miezul nopții n-ajută pe nimeni. Agenda de seara le acoperă.
        if (ev.allDay || !ev.start) continue;

        const start = new Date(ev.start);
        if (Number.isNaN(start.getTime()) || start <= acum) continue;

        const existenta = programari.find((s) => s.payload?.event_id === ev.id);
        if (existenta) {
          // Aceeași oră → alarma e bună. Oră schimbată (eveniment mutat) → se rescrie.
          if (existenta.payload?.start_iso === ev.start) continue;
          await this.cancelSchedule(existenta.id);
        }

        // Dacă momentul mementoului a trecut deja (eveniment creat în ultima clipă), dar
        // evenimentul n-a început, anunță acum — mai bine cu 8 minute înainte decât deloc.
        const cand = new Date(start.getTime() - lead * 60 * 1000);
        await this.schedule(cand > acum ? cand : new Date(Date.now() + 5000), MEMENTO_CALLBACK, {
          event_id: ev.id,
          start_iso: ev.start,
          titlu: ev.title,
          locatie: ev.location || '',
        });
      }
    } catch (err) {
      // Un calendar necitit nu are voie să oprească lanțul de măturări: reprogramarea de mai jos
      // rulează oricum, iar peste 20 de minute se încearcă din nou.
      console.error('MEMENTO_MATURARE_ESUATA', String(err?.message || err));
    }

    await this.schedule(new Date(Date.now() + MEMENTO_PAS_MINUTE * 60 * 1000), MEMENTO_SWEEP_CALLBACK, {});
  }

  /**
   * Alarma unui eveniment anume.
   *
   * Re-întreabă calendarul ÎNAINTE să vorbească. Măturarea parcurge evenimente, nu programări,
   * deci n-are cum să anuleze alarma unui eveniment care între timp a dispărut din fereastră —
   * singurul moment în care adevărul e sigur e chiar clipa asta. Un eveniment șters sau mutat
   * între măturare și alarmă e cazul normal, nu cel marginal.
   */
  async trimiteMementoEveniment(payload) {
    try {
      const ev = await getCalendarEvent(this.env, payload.event_id);
      if (!ev || ev.status === 'cancelled') return;

      const start = ev.start?.dateTime || ev.start?.date;
      if (start !== payload.start_iso) return; // mutat — măturarea îi va face alarmă nouă
    } catch (err) {
      // Dacă nu putem verifica, anunțăm totuși: un memento în plus pentru un eveniment care mai
      // există e o supărare mică; unul lipsă la o întâlnire reală e exact lucrul pe care îl
      // construim aici ca să nu se întâmple.
      console.error('MEMENTO_VERIFICARE_ESUATA', String(err?.message || err));
    }

    const timeZone = this.env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
    const ora = new Intl.DateTimeFormat('ro-RO', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(payload.start_iso));

    const titlu = payload.titlu || 'Ai ceva programat';
    const text = `${titlu} — la ${ora}${payload.locatie ? `, ${payload.locatie}` : ''}`;

    const rezultat = await this.notificaPeTelefon('În curând', text, 'memento');
    if (!rezultat?.ok) {
      // Telefonul nu e disponibil (aplicația oprită, fără abonament push). Un memento care nu
      // ajunge e mai rău decât unul care ajunge pe alt canal.
      await sendTelegramMessage(this.env, { chatId: this.name, text: `⏰ ${text}` }).catch(() => {});
    }
  }

  // Callback-ul programărilor de aer condiționat (vezi tools/air-conditioner.js). Anunță pe
  // Telegram rezultatul — altfel o programare eșuată ar trece neobservată.
  async runScheduledAirConditioner(payload) {
    let text;
    try {
      const result = await runScheduledAcCommand(this.env, payload, this);
      const s = result.stare_dupa;
      const stare = s ? ` Acum: ${s.pornit ? 'pornit' : 'oprit'}, ${s.mod}, ${s.temperatura_setata}°C (în cameră ${s.temperatura_camera}°C).` : '';
      text = `Programare aer condiționat rulată: ${result.descriere}.${stare}`;
    } catch (err) {
      text = `Programarea de aer condiționat a eșuat: ${err.message}`;
    }
    await sendTelegramMessage(this.env, { chatId: this.name, text }).catch(() => {});
  }

  // Executorul de unelte pentru calea vocală (VoiceSession → RPC pe stub-ul acestui agent).
  //
  // De ce nu cheamă VoiceSession direct executeTool: uneltele de aer condiționat folosesc
  // `agent.schedule()`, `agent.listSchedules()`, `agent.cancelSchedule()` — metode pe INSTANȚA
  // Durable Object. Un stub obținut cu getAgentByName NU e instanța (n-are nici starea, nici
  // alarmele ei), deci pasat ca `agent` ar rupe programările. Aici `this` e instanța reală, deci
  // o programare făcută prin voce rulează și notifică exact ca una făcută din Telegram.
  async runVoiceTool(name, input) {
    return executeTool(this.env, name, input, this);
  }

  // ─── Apeluri telefonice ────────────────────────────────────────────────────────────────
  //
  // DE CE există bariera asta, deși modelul „n-ar trebui" să sune de două ori:
  //
  // Istoricul păstrează DOAR textul conversației — apelurile de unealtă și rezultatele lor nu
  // se salvează. Iar un apel vocal care se închide (telefonul intră în convorbire) și se
  // redeschide la revenire pornește o sesiune NOUĂ, care încarcă istoricul și vede „sună-l pe
  // tata" fără nicio urmă că s-a sunat deja. Face atunci lucrul evident: sună. Închizi, revine,
  // sună iar. S-a întâmplat: două `ACTION_CALL` la patru secunde distanță, apoi în buclă.
  //
  // Un apel dat din greșeală sună un OM, care vede un apel pierdut de la tine. E singura unealtă
  // din tot proiectul al cărei eșec deranjează pe altcineva, deci nu se apără prin prompt —
  // promptul e o rugăminte, asta e o poartă.

  async ultimulApel() {
    const rows = this.sql`SELECT value FROM agent_meta WHERE key = 'ultimul_apel'`;
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].value);
    } catch {
      return null;
    }
  }

  async noteazaApel(numar, nume) {
    const date = JSON.stringify({ numar, nume: nume || null, cand: Date.now() });
    this.sql`
      INSERT INTO agent_meta (key, value) VALUES ('ultimul_apel', ${date})
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `;
  }

  // ─── Notificări push ───────────────────────────────────────────────────────────────────
  //
  // Abonamentul telefonului (endpoint + chei) stă în `agent_meta`, nu într-un tabel separat:
  // e un singur utilizator, deci un singur abonament activ. La reabonare se suprascrie.

  async savePushSubscription(subscription) {
    this.sql`
      INSERT INTO agent_meta (key, value) VALUES ('push_subscription', ${JSON.stringify(subscription)})
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `;
    return { ok: true };
  }

  getPushSubscription() {
    const rows = this.sql`SELECT value FROM agent_meta WHERE key = 'push_subscription'`;
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].value);
    } catch {
      return null;
    }
  }

  // Textul notificării NU călătorește cu semnalul de push (vezi src/push.js) — se lasă aici, iar
  // service worker-ul îl cere când sună telefonul. Ținem doar ultimul: dacă se adună mai multe
  // înainte să fie citite, cea nouă o înlocuiește pe cea veche în loc să facă o coadă pe care
  // n-ar citi-o nimeni.
  async setPendingNotification(titlu, text) {
    this.sql`
      INSERT INTO agent_meta (key, value)
      VALUES ('push_pending', ${JSON.stringify({ titlu, text, la: Date.now() })})
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `;
  }

  async takePendingNotification() {
    const rows = this.sql`SELECT value FROM agent_meta WHERE key = 'push_pending'`;
    if (rows.length === 0) return null;
    this.sql`DELETE FROM agent_meta WHERE key = 'push_pending'`;
    try {
      return JSON.parse(rows[0].value);
    } catch {
      return null;
    }
  }

  // Există vreo cale de a ajunge la telefon? Se uită la AMBELE: legătura permanentă a
  // aplicației native ȘI abonamentul de notificări web. Verificând doar una, asistentul ar
  // spune „nu am unde trimite" exact când cealaltă e disponibilă.
  async poateAjungeLaTelefon() {
    try {
      const id = this.env.LISTEN_SESSION.idFromName(String(this.name));
      if (await this.env.LISTEN_SESSION.get(id).eConectat()) return true;
    } catch {
      /* fără legătură nativă; mai rămâne push-ul */
    }
    return !!this.getPushSubscription();
  }

  // Trimite acum o notificare pe telefon. Încearcă DOUĂ căi, în ordinea asta:
  //
  // 1. Legătura permanentă a aplicației native (ListenSession). Ajunge instant, poate aprinde
  //    ecranul ca un apel adevărat, și nu depinde de niciun serviciu al altcuiva.
  // 2. Web Push, pentru varianta din browser / APK-ul vechi.
  //
  // Prima are prioritate fiindcă e singura care poate suna, nu doar anunța.
  async notificaPeTelefon(titlu, text, tip = 'notificare') {
    try {
      const id = this.env.LISTEN_SESSION.idFromName(String(this.name));
      const listen = this.env.LISTEN_SESSION.get(id);
      const rezultat = await listen.trimiteEveniment({ tip, titlu, text, la: Date.now() });
      if (rezultat.livrate > 0) return { ok: true, cale: 'nativ' };
    } catch (err) {
      console.error('LISTEN_TRIMITERE_ESUATA', String(err?.message || err));
    }

    const subscription = this.getPushSubscription();
    if (!subscription) return { ok: false, motiv: 'Telefonul nu e abonat la notificări.' };

    await this.setPendingNotification(titlu, text);
    const rezultat = await sendPush(this.env, subscription);

    // Abonament mort (aplicație dezinstalată, permisiune retrasă): îl ștergem, altfel am
    // reîncerca la nesfârșit către un endpoint care nu mai există.
    if (rezultat.expirat) {
      this.sql`DELETE FROM agent_meta WHERE key = 'push_subscription'`;
      return { ok: false, motiv: 'Abonamentul telefonului a expirat — redeschide aplicația.' };
    }
    return { ok: rezultat.ok, motiv: rezultat.ok ? null : `Serviciul de push a răspuns ${rezultat.status}` };
  }

  // Callback-ul programărilor făcute cu unealta `programeaza_apel` (vezi tools/notificari.js).
  // Aceeași formă ca runScheduledAirConditioner: o metodă pe agent, chemată de `this.schedule`.
  async runScheduledNotification(payload) {
    const { titlu, text, repeta } = payload || {};
    const rezultat = await this.notificaPeTelefon(titlu || 'Asistent', text || 'Te caut.');

    // Dacă telefonul nu poate fi notificat, nu pierdem mesajul — pleacă pe Telegram.
    if (!rezultat.ok) {
      await sendTelegramMessage(this.env, {
        chatId: this.name,
        text: `${titlu ? titlu + ': ' : ''}${text}`,
      }).catch(() => {});
    }

    if (repeta === 'daily') {
      const urmatoarea = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.schedule(urmatoarea, 'runScheduledNotification', payload);
    }
  }

  // ─── Spotify ───────────────────────────────────────────────────────────────────────────
  //
  // Refresh token-ul Spotify e singurul secret al proiectului care NU se pune cu mâna, și
  // dinadins: el se naște în urma unei autorizări din browser, deci e deja acolo, în Worker,
  // în momentul în care ar trebui copiat. Să-l afișăm ca să-l lipească omul înapoi ar fi un
  // drum dus-întors degeaba, cu ocazia unei greșeli de copiere la fiecare reautorizare.
  //
  // Stă lângă sesiunea Alexa, în `agent_meta`. Dacă e pus totuși ca secret
  // (`SPOTIFY_REFRESH_TOKEN`), acela are prioritate — vezi tools/spotify.js.

  async salveazaSpotifyToken(token) {
    const curat = String(token || '').trim();
    if (!curat) return { ok: false };
    this.sql`
      INSERT INTO agent_meta (key, value) VALUES ('spotify_refresh_token', ${curat})
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `;
    return { ok: true };
  }

  async getSpotifyToken() {
    const randuri = this.sql`SELECT value FROM agent_meta WHERE key = 'spotify_refresh_token'`;
    return randuri.length > 0 ? randuri[0].value : null;
  }

  // ─── WhatsApp ──────────────────────────────────────────────────────────────────────────
  //
  // Telefonul împinge aici fiecare mesaj pe care îl vede în notificări (ruta /whatsapp/mesaj).
  // Worker-ul nu întreabă niciodată telefonul „ce mesaje ai" — n-ar avea cum: telefonul poate
  // fi în buzunar, cu ecranul stins, iar legătura e deschisă dinspre el.

  async salveazaMesajWhatsapp(mesaj) {
    const expeditor = String(mesaj?.expeditor || '').trim();
    const text = String(mesaj?.text || '').trim();
    if (!expeditor || !text) return { ok: false, motiv: 'mesaj incomplet' };

    // WhatsApp REPOSTEAZĂ notificarea unei conversații la fiecare mesaj nou, cu tot firul în
    // ea. Fără verificarea asta, aceleași cuvinte s-ar aduna de zeci de ori și asistentul ar
    // citi de cinci ori același mesaj. Fereastra de 10 minute acoperă repostările, dar lasă
    // trecut un „ok" trimis din nou peste o oră.
    const duplicat = this.sql`
      SELECT id FROM whatsapp_messages
      WHERE expeditor = ${expeditor} AND text = ${text} AND la > unixepoch() - 600
      LIMIT 1
    `;
    if (duplicat.length > 0) return { ok: true, duplicat: true };

    this.sql`
      INSERT INTO whatsapp_messages (cheie, expeditor, grup, text, poate_raspunde)
      VALUES (
        ${String(mesaj.cheie || '')},
        ${expeditor},
        ${String(mesaj.grup || '')},
        ${text},
        ${mesaj.poate_raspunde ? 1 : 0}
      )
    `;

    // Ținem ultimele 300. Nu e istoric, e o fereastră — scopul e „ce mi-a scris lumea de
    // curând", iar un tabel care crește la nesfârșit într-un Durable Object e doar cost.
    this.sql`
      DELETE FROM whatsapp_messages
      WHERE id <= (SELECT MAX(id) FROM whatsapp_messages) - 300
    `;

    return { ok: true };
  }

  async mesajeWhatsapp(limita = 15, deLa = '') {
    const filtru = `%${String(deLa || '').trim()}%`;
    const randuri = deLa
      ? this.sql`
          SELECT expeditor, grup, text, la FROM whatsapp_messages
          WHERE expeditor LIKE ${filtru} OR grup LIKE ${filtru}
          ORDER BY id DESC LIMIT ${limita}
        `
      : this.sql`
          SELECT expeditor, grup, text, la FROM whatsapp_messages
          ORDER BY id DESC LIMIT ${limita}
        `;

    const timeZone = this.env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
    return randuri.map((r) => ({
      de_la: r.expeditor,
      grup: r.grup || undefined,
      text: r.text,
      cand: new Intl.DateTimeFormat('ro-RO', {
        timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(r.la * 1000)),
    }));
  }

  // Trimiterea trece prin telefon, pe legătura permanentă. Două moduri, alese aici (nu de
  // model): răspuns în firul unei conversații care ne-a scris, sau deschiderea WhatsApp cu
  // mesajul pregătit. Al doilea NU trimite singur — vezi comentariul din tools/whatsapp.js.
  async trimiteWhatsapp({ destinatar, numar, text }) {
    let comanda = null;

    if (destinatar) {
      const filtru = `%${destinatar}%`;
      const randuri = this.sql`
        SELECT cheie, expeditor, grup FROM whatsapp_messages
        WHERE poate_raspunde = 1 AND cheie != '' AND (expeditor LIKE ${filtru} OR grup LIKE ${filtru})
        ORDER BY id DESC LIMIT 1
      `;
      if (randuri.length > 0) {
        comanda = {
          tip: 'whatsapp_raspunde',
          cheie: randuri[0].cheie,
          catre: randuri[0].grup || randuri[0].expeditor,
          text,
        };
      }
    }

    if (!comanda && numar) {
      comanda = { tip: 'whatsapp_nou', numar, text };
    }

    if (!comanda) {
      const err = new Error(
        `„${destinatar}" nu apare printre conversațiile recente, deci nu pot trimite direct. ` +
          'Cere-i utilizatorului numărul de telefon cu prefix (+40...) și încearcă din nou cu el.'
      );
      err.code = 'WHATSAPP_UNKNOWN_TARGET';
      throw err;
    }

    const rezultat = await this.trimiteComandaLaTelefon(comanda);
    if (!rezultat.ok) {
      const err = new Error(rezultat.motiv || 'Telefonul nu a putut trimite mesajul.');
      err.code = 'WHATSAPP_SEND_FAILED';
      throw err;
    }

    return comanda.tip === 'whatsapp_raspunde'
      ? { trimis: true, catre: comanda.catre, text }
      : {
          trimis: false,
          deschis_pe_telefon: true,
          numar: comanda.numar,
          text,
          nota:
            'Am deschis WhatsApp pe telefon cu mesajul scris. Spune-i utilizatorului că trebuie ' +
            'să apese el trimite — Android nu lasă o aplicație să apese butonul alteia.',
        };
  }

  // Comandă spre telefon, cu confirmare. Diferă de notificaPeTelefon: aia anunță și nu
  // așteaptă nimic înapoi; asta cere o acțiune și vrea să știe dacă a reușit.
  async trimiteComandaLaTelefon(comanda) {
    try {
      const id = this.env.LISTEN_SESSION.idFromName(String(this.name));
      return await this.env.LISTEN_SESSION.get(id).trimiteComanda(comanda);
    } catch (err) {
      console.error('COMANDA_TELEFON_ESUATA', String(err?.message || err));
      return { ok: false, motiv: 'Nu am putut ajunge la telefon.' };
    }
  }

  // ─── Poarta de confirmare + jurnalul ───────────────────────────────────────────────────
  //
  // Vezi tools/confirmare.js pentru de ce există și cum se compune cu paza din telefon.js.
  // Aici e doar mecanica: ce s-a cerut, când, și dacă omul a apucat să răspundă între timp.

  async verificaConfirmarea({ amprenta, descriere }) {
    let ceruta = null;
    try {
      const brut = this.metaText('confirmare_ceruta');
      ceruta = brut ? JSON.parse(brut) : null;
    } catch {
      ceruta = null;
    }

    const maxRand = this.sql`SELECT MAX(id) AS id FROM messages`;
    const mesajeAcum = Number(maxRand[0]?.id ?? 0);

    // A TREIA condiție (`mesajeAcum > ceruta.mesaje_la_cerere`) nu e un lux, e ce ține poarta
    // închisă în cazul care chiar se întâmplă: un mesaj de tipul „șterge X și sună-l pe tata"
    // produce DOUĂ apeluri de unealtă în același tur, rulate în paralel (Promise.all, vezi
    // anthropic.js și session.js). Fără ea, a doua unealtă ar găsi cererea scrisă de prima, ar
    // socoti că s-a confirmat, și s-ar executa fără ca omul să fi văzut vreo întrebare.
    // Într-un lot paralel nu s-a scris încă niciun mesaj nou, deci condiția e falsă pentru toate.
    const potrivire =
      ceruta &&
      ceruta.amprenta === amprenta &&
      Date.now() - Number(ceruta.cand || 0) < FEREASTRA_CONFIRMARE_MS &&
      mesajeAcum > Number(ceruta.mesaje_la_cerere ?? 0);

    if (potrivire) {
      this.sql`DELETE FROM agent_meta WHERE key = 'confirmare_ceruta'`;
      return { gata: true };
    }

    this.scrieMeta(
      'confirmare_ceruta',
      JSON.stringify({ amprenta, descriere, cand: Date.now(), mesaje_la_cerere: mesajeAcum })
    );

    // Rezultat de SUCCES, nu excepție: anthropic.js transformă orice `throw` într-un tool_result
    // cu is_error, iar promptul (secțiunea „SPUNE CE FACI") îl obligă atunci pe model să explice
    // cauza — adică să inventeze o defecțiune care nu există. Forma e cea de la `deja_sunat` din
    // telefon.js, care funcționează deja pe amândouă canalele.
    return {
      gata: false,
      raspuns: {
        executat: false,
        cere_confirmare: true,
        ce_urmeaza: descriere,
        nota:
          'NU am făcut nimic încă. Spune-i utilizatorului exact ce urmează să faci, cu datele de ' +
          'mai sus, și cere-i o confirmare clară. Dacă spune da, cheamă unealta DIN NOU, cu exact ' +
          'aceleași argumente — abia atunci se execută. Valabil 3 minute. Nu spune „am șters", ' +
          '„am sunat" sau „am trimis": nu s-a întâmplat.',
      },
    };
  }

  async scrieInJurnal({ unealta, rezumat, dateRefacere }) {
    const date = dateRefacere ? JSON.stringify(dateRefacere) : null;
    this.sql`
      INSERT INTO jurnal_actiuni (unealta, rezumat, date_refacere) VALUES (${unealta}, ${rezumat}, ${date})
    `;
    // Ultimele 200, ca la whatsapp_messages: e o fereastră de „ce s-a făcut de curând", nu o
    // arhivă. Un tabel care crește la nesfârșit într-un DO e doar cost.
    this.sql`
      DELETE FROM jurnal_actiuni WHERE id <= (SELECT MAX(id) FROM jurnal_actiuni) - 200
    `;
  }

  async jurnalRecent(limita = 15) {
    const randuri = this.sql`
      SELECT id, unealta, rezumat, date_refacere, refacut_la, la FROM jurnal_actiuni
      ORDER BY id DESC LIMIT ${limita}
    `;
    const timeZone = this.env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
    return randuri.map((r) => ({
      id: r.id,
      ce: r.rezumat,
      cand: new Intl.DateTimeFormat('ro-RO', {
        timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(r.la * 1000)),
      se_poate_reface: !!r.date_refacere && !r.refacut_la,
    }));
  }

  async intrareJurnal(id) {
    const numar = Number(id);
    if (!Number.isInteger(numar)) return null;
    const randuri = this.sql`
      SELECT id, unealta, rezumat, date_refacere, refacut_la FROM jurnal_actiuni WHERE id = ${numar}
    `;
    if (randuri.length === 0) return null;

    const r = randuri[0];
    let date = null;
    try {
      date = r.date_refacere ? JSON.parse(r.date_refacere) : null;
    } catch {
      date = null;
    }
    return { id: r.id, unealta: r.unealta, rezumat: r.rezumat, date_refacere: date, refacut_la: r.refacut_la };
  }

  async marcheazaRefacut(id) {
    this.sql`UPDATE jurnal_actiuni SET refacut_la = unixepoch() WHERE id = ${Number(id)}`;
  }

  // ─── Memorie de lungă durată ───────────────────────────────────────────────────────────
  //
  // Promptul îi cerea „ține minte", dar tot ce avea era fereastra de 20 de mesaje: ce s-a vorbit
  // acum două zile nu mai exista. Memoria are două jumătăți, cu vieți diferite:
  //
  //   `fapte`          — ce rămâne adevărat (nume, preferințe, ce îl preocupă). Nu expiră.
  //   `rezumat_istoric`— ce s-a vorbit, condensat, pe măsură ce mesajele ies din fereastră.
  //
  // Amândouă ajung la model prin `textMemorie()`, ca AL DOILEA bloc de system — vezi anthropic.js.

  // Cât de multe mesaje trebuie să iasă din fereastră înainte să merite un rezumat nou. Fiecare
  // rezumat e un apel de model în plus; făcut la fiecare mesaj, ar dubla costul fiecărui tur
  // pentru un câștig care oricum se vede abia după zeci de mesaje.
  static PRAG_REZUMAT = 20;

  // Comparația de duplicate se face pe text normalizat (fără diacritice, fără majuscule, fără
  // spații în plus): „Sora mea se numește Ana." și „sora mea se numeste ana" sunt aceeași faptă.
  static normalizeazaFapt(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.!?;,]+$/, '')
      .trim();
  }

  async tineMinte(text, sursa = 'auto') {
    const curat = String(text || '').trim();
    if (!curat) return { ok: false, motiv: 'text gol' };

    const normalizat = AssistantAgent.normalizeazaFapt(curat);
    const existente = this.sql`SELECT id, text FROM fapte`;
    const duplicat = existente.find((f) => AssistantAgent.normalizeazaFapt(f.text) === normalizat);
    if (duplicat) return { ok: true, id: duplicat.id, duplicat: true };

    this.sql`INSERT INTO fapte (text, sursa) VALUES (${curat}, ${sursa === 'cerut' ? 'cerut' : 'auto'})`;
    const randuri = this.sql`SELECT MAX(id) AS id FROM fapte`;
    return { ok: true, id: randuri[0]?.id ?? null, duplicat: false };
  }

  async faptele(limita = 200) {
    const randuri = this.sql`SELECT id, text, sursa, creat_la FROM fapte ORDER BY id ASC LIMIT ${limita}`;
    const timeZone = this.env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
    return randuri.map((r) => ({
      id: r.id,
      text: r.text,
      sursa: r.sursa,
      de_cand: new Intl.DateTimeFormat('ro-RO', {
        timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
      }).format(new Date(r.creat_la * 1000)),
    }));
  }

  async uitaFapt(id) {
    const numar = Number(id);
    if (!Number.isInteger(numar)) return { ok: false, motiv: 'id invalid' };
    const randuri = this.sql`SELECT text FROM fapte WHERE id = ${numar}`;
    if (randuri.length === 0) return { ok: false, sters: false, motiv: 'nu există o faptă cu id-ul ăsta' };
    this.sql`DELETE FROM fapte WHERE id = ${numar}`;
    return { ok: true, sters: true, text: randuri[0].text };
  }

  // ─── Versiunile de piese ținute minte (tabelul piese_spotify) ──────────────────────────

  /**
   * Titlul, adus la forma pe care o căutăm în tabel.
   *
   * Diacriticele se scot dinadins: același cântec ajunge aici o dată din gura lui (dictare
   * vocală, cu diacritice) și o dată din Planning Center (unde sunt scrise cum s-a nimerit).
   * „Mărire" și „Marire" trebuie să fie același rând, altfel memoria ratează exact la fluxul
   * pentru care a fost făcută — „pune tot ce e duminică".
   */
  static normalizeazaTitlu(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/s+/g, ' ')
      .trim();
  }

  /**
   * Mapările pentru o listă de titluri, dintr-un singur drum prin SQL.
   *
   * Întoarce un ARRAY aliniat la intrare (`null` unde nu știm nimic), nu un Map pe titluri
   * normalizate. Dinadins: un Map l-ar obliga pe apelant să normalizeze el cheia ca să caute în
   * el, adică să dubleze `normalizeazaTitlu` în alt fișier. Două copii ale aceleiași
   * normalizări se despart mai devreme sau mai târziu, iar când se despart memoria nu dă
   * eroare — doar ratează tăcut și cântă iar versiunea greșită.
   */
  async pieseSalvate(titluri) {
    const chei = (titluri || []).map((t) => AssistantAgent.normalizeazaTitlu(t));
    if (chei.every((c) => !c)) return chei.map(() => null);

    // Tabelul are zeci de rânduri, nu mii: îl citim întreg și filtrăm în JS. Un IN (...) cu
    // număr variabil de parametri n-ar merge oricum cu template-ul `sql`.
    const randuri = this.sql`SELECT titlu, uri, nume, artist FROM piese_spotify`;
    const dupaTitlu = new Map(
      randuri.map((r) => [r.titlu, { uri: r.uri, nume: r.nume, artist: r.artist }])
    );
    return chei.map((cheie) => {
      if (!cheie) return null;
      const exact = dupaTitlu.get(cheie);
      if (exact) return exact;

      // Potrivire pe conținere, ca plasă de siguranță. Căutarea care vine de la model e un
      // text liber și poate avea artistul lipit de titlu („Mii de laude Biserica Betel"),
      // pe când versiunea reținută e sub titlul curat, cum i-a zis EL. Fără pasul ăsta,
      // memoria ar rata exact la fluxul pentru care a fost făcută.
      //
      // Se cere titlu de cel puțin 4 caractere și se ia potrivirea cea mai LUNGĂ: altfel
      // „Aleluia" din tabel ar fura orice căutare care conține cuvântul.
      let gasit = null;
      let lungime = 0;
      for (const [titlu, piesa] of dupaTitlu) {
        if (titlu.length < 4 || titlu.length <= lungime) continue;
        if (cheie.includes(titlu)) { gasit = piesa; lungime = titlu.length; }
      }
      return gasit;
    });
  }

  /** Scrie (sau suprascrie) versiunea corectă pentru un titlu. */
  async tinePiesa(titlu, { uri, nume, artist, sursa = 'corectat' }) {
    const cheie = AssistantAgent.normalizeazaTitlu(titlu);
    if (!cheie || !uri) return { ok: false, motiv: 'titlu sau uri gol' };
    this.sql`
      INSERT INTO piese_spotify (titlu, uri, nume, artist, sursa)
      VALUES (${cheie}, ${uri}, ${nume || ''}, ${artist || ''}, ${sursa})
      ON CONFLICT(titlu) DO UPDATE SET
        uri = excluded.uri, nume = excluded.nume,
        artist = excluded.artist, sursa = excluded.sursa
    `;
    return { ok: true, titlu: cheie };
  }

  async uitaPiesa(titlu) {
    const cheie = AssistantAgent.normalizeazaTitlu(titlu);
    const randuri = this.sql`SELECT nume, artist FROM piese_spotify WHERE titlu = ${cheie}`;
    if (randuri.length === 0) return { ok: false, motiv: 'nu țin minte nicio versiune pentru titlul ăsta' };
    this.sql`DELETE FROM piese_spotify WHERE titlu = ${cheie}`;
    return { ok: true, nume: randuri[0].nume, artist: randuri[0].artist };
  }

  async pieseleStiute() {
    const randuri = this.sql`SELECT titlu, nume, artist FROM piese_spotify ORDER BY titlu ASC`;
    return randuri.map((r) => ({ titlu: r.titlu, nume: r.nume, artist: r.artist }));
  }

  /**
   * Blocul de memorie, gata de pus în system. UN singur bloc pentru amândouă jumătățile: sunt
   * același fel de lucru pentru model („ce știu dinainte") și se schimbă la fel de rar.
   *
   * Întoarce string GOL când nu e nimic de spus — apelantul trebuie să sară peste bloc, fiindcă
   * API-ul Anthropic respinge un bloc de text gol.
   *
   * Id-urile faptelor sunt incluse dinadins: fără ele, orice ștergere ar cere întâi un drum în
   * plus prin `ce_tii_minte`, iar modelul ar fi tentat să inventeze un id (vezi regula
   * event_id-urilor din calendar.js).
   */
  async textMemorie() {
    const fapte = this.sql`SELECT id, text FROM fapte ORDER BY id ASC LIMIT 200`;
    const rezumat = this.metaText('rezumat_istoric');

    const parti = [];
    if (fapte.length > 0) {
      parti.push(
        'CE ȘTII DESPRE EL (fapte reținute; numărul din paranteze e id-ul, folosit la `uita`)\n' +
          fapte.map((f) => `- (${f.id}) ${f.text}`).join('\n')
      );
    }
    if (rezumat) {
      parti.push('CE S-A VORBIT ÎNAINTE (rezumatul conversațiilor ieșite din fereastra recentă)\n' + rezumat);
    }
    if (parti.length === 0) return '';

    return (
      'MEMORIE\n\n' +
      parti.join('\n\n') +
      '\n\nAstea sunt lucruri pe care le ȘTII, nu sarcini de făcut. Folosește-le firesc, când au ' +
      'sens în discuție — nu le enumera ca să arăți că ții minte.'
    );
  }

  /**
   * Condensează mesajele care au ieșit din fereastra recentă, în loturi.
   *
   * Rulează prin coada SDK-ului, după ce răspunsul a plecat deja spre om: e un al doilea apel de
   * model, de câteva secunde, și n-are voie să stea între întrebare și răspuns.
   *
   * `rezumat_pana_la_id` e semnul de carte: tot ce e sub el a fost deja povestit o dată. Rezumatul
   * anterior intră în promptul celui nou, deci memoria se îngroașă, nu se înlocuiește.
   */
  async intretineRezumat() {
    const maxRand = this.sql`SELECT MAX(id) AS id FROM messages`;
    const maxId = Number(maxRand[0]?.id ?? 0);
    const semn = Number(this.metaText('rezumat_pana_la_id') || 0);
    const pana = maxId - HISTORY_WINDOW;

    if (pana - semn < AssistantAgent.PRAG_REZUMAT) return;

    const randuri = this.sql`
      SELECT role, content FROM messages WHERE id > ${semn} AND id <= ${pana} ORDER BY id ASC
    `;
    if (randuri.length === 0) return;

    const transcriere = randuri
      .map((r) => {
        let text = null;
        try {
          text = JSON.parse(r.content);
        } catch {
          text = null;
        }
        if (typeof text !== 'string' || !text.trim()) return null;
        return `${r.role === 'user' ? 'EL' : 'TU'}: ${text.trim()}`;
      })
      .filter(Boolean)
      .join('\n');

    if (!transcriere) {
      // Nimic de rezumat (lot numai cu conținut nontextual) — mută semnul, altfel lotul ăsta
      // blochează pragul la nesfârșit.
      this.scrieMeta('rezumat_pana_la_id', String(pana));
      return;
    }

    try {
      const nou = await rezumaConversatie(this.env, {
        transcriere,
        rezumatAnterior: this.metaText('rezumat_istoric'),
      });
      if (nou) this.scrieMeta('rezumat_istoric', nou);
      this.scrieMeta('rezumat_pana_la_id', String(pana));
    } catch (err) {
      // Semnul NU se mută: la următoarea rulare se reîncearcă același lot. Un rezumat ratat e o
      // gaură permanentă în memorie dacă îl sărim.
      console.error('REZUMAT_ESUAT', String(err?.message || err));
    }
  }

  // Istoricul recent, pentru începutul unui apel vocal: fără el, fiecare apel ar porni cu
  // memoria goală, iar o discuție începută ieri (sau pe Telegram) n-ar exista pentru asistent.
  // Întoarce cel mai vechi întâi, cum se citește o conversație.
  async getRecentHistory(limit = HISTORY_WINDOW) {
    const rows = this.sql`
      SELECT role, content FROM messages ORDER BY id DESC LIMIT ${limit}
    `.reverse();

    return rows
      .map((row) => {
        let content = null;
        try {
          content = JSON.parse(row.content);
        } catch {
          content = null;
        }
        return { role: row.role, content: typeof content === 'string' ? content : null };
      })
      .filter((row) => row.content);
  }

  /**
   * Același istoric, dar pentru ECRAN (sertarul din PWA), nu pentru model.
   *
   * Metodă separată de `getRecentHistory`, deși citesc același tabel: aia are un contract cu
   * `buildHistoryMessage` din voice/gemini.js (doar `role` + `content` text, restul filtrat).
   * Lărgită ca să mulțumească și ecranul, ar începe să care câmpuri de care Gemini n-are nevoie,
   * iar prima schimbare făcută pentru unul l-ar strica tăcut pe celălalt.
   *
   * `canal` e NULL pentru mesajele scrise înainte de migrare — ecranul le arată nemarcate.
   */
  async istoricPentruEcran(limita = 40) {
    const randuri = this.sql`
      SELECT role, content, canal, created_at FROM messages ORDER BY id DESC LIMIT ${limita}
    `.reverse();

    const timeZone = this.env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
    return randuri
      .map((r) => {
        let text = null;
        try {
          text = JSON.parse(r.content);
        } catch {
          text = null;
        }
        if (typeof text !== 'string' || !text.trim()) return null;
        return {
          role: r.role,
          text,
          canal: r.canal || '',
          cand: new Intl.DateTimeFormat('ro-RO', {
            timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
          }).format(new Date(r.created_at * 1000)),
        };
      })
      .filter(Boolean);
  }

  // Conversația vocală ajunge în același tabel `messages` ca cea din Telegram — un singur fir,
  // indiferent de canal. Vine din inputAudioTranscription/outputAudioTranscription (Gemini Live).
  async saveVoiceTranscript(role, text) {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return;
    this.sql`INSERT INTO messages (role, content, canal) VALUES (${role}, ${JSON.stringify(clean)}, 'voce')`;
  }

  /**
   * O faptă, scrisă în istoric ca text.
   *
   * Istoricul ține DOAR text — apelurile de unealtă și rezultatele lor nu se salvează. Pentru
   * majoritatea uneltelor n-are importanță: dacă modelul repetă o căutare, nu pierde nimeni
   * nimic. Pentru cele care ating lumea din afară, are: o sesiune nouă încarcă istoricul, vede
   * cererea fără urma împlinirii ei, și o face din nou. Așa a ajuns un apel telefonic să fie dat
   * de mai multe ori la rând (vezi `ultimulApel`).
   *
   * Scris ca replică a asistentului, în paranteze, ca să se citească a însemnare, nu a vorbă.
   */
  async noteazaInIstoric(text) {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return;
    this.sql`INSERT INTO messages (role, content, canal) VALUES ('assistant', ${JSON.stringify(clean)}, 'nota')`;
  }

  // Răspunde imediat 200 și procesează asincron prin coada internă a SDK-ului — dacă am aștepta
  // aici pipeline-ul complet (Claude + Calendar + Telegram, ~3-7s), un timeout pe partea de
  // Telegram ar declanșa o reîncercare și ar putea crea un eveniment duplicat în calendar.
  async onRequest(request) {
    const update = await request.json();
    this.queue('processUpdate', update);
    return new Response('OK', { status: 200 });
  }

  async processUpdate(update) {
    if (!isPrivateTextMessage(update)) return;

    const updateId = update.update_id;
    const already = this.sql`SELECT update_id FROM processed_updates WHERE update_id = ${updateId}`;
    if (already.length > 0) return; // livrare Telegram "at least once" — dedup defensiv
    this.sql`INSERT INTO processed_updates (update_id) VALUES (${updateId})`;

    const chatId = update.message.chat.id;
    const userText = update.message.text;

    this.sql`INSERT INTO messages (role, content, canal) VALUES ('user', ${JSON.stringify(userText)}, 'telegram')`;

    try {
      const history = this.sql`
        SELECT role, content FROM messages ORDER BY id DESC LIMIT ${HISTORY_WINDOW}
      `.reverse();

      const messages = history.map((row) => ({
        role: row.role,
        content: JSON.parse(row.content),
      }));

      // Data/ora se injectează AICI, doar în mesajul curent trimis către Claude — nu se salvează
      // în SQL (mesajele vechi din istoric nu trebuie să care date/ore ale altor momente) și nu
      // stă în system prompt (l-ar face să se schimbe în fiecare minut, invalidând cache-ul —
      // vezi buildDateContext în prompt.js).
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && typeof lastMessage.content === 'string') {
        lastMessage.content = [
          { type: 'text', text: buildDateContext(this.env) },
          { type: 'text', text: lastMessage.content },
        ];
      }

      const replyText = await runToolLoop(this.env, {
        system: buildSystemPrompt(this.env),
        memorie: await this.textMemorie(),
        messages,
        tools: TOOL_DEFINITIONS,
        executeTool: (name, input) => executeTool(this.env, name, input, this),
      });

      this.sql`INSERT INTO messages (role, content, canal) VALUES ('assistant', ${JSON.stringify(replyText)}, 'telegram')`;
      await sendTelegramMessage(this.env, { chatId, text: replyText });
    } catch (err) {
      const friendly = ERROR_MESSAGES[err.code] ?? 'A apărut o eroare neașteptată. Încearcă din nou.';
      if (friendly) {
        await sendTelegramMessage(this.env, { chatId, text: friendly }).catch(() => {});
      }
    }

    // Abia acum, după ce răspunsul a plecat: rezumatul e un al doilea apel de model și n-are voie
    // să stea între întrebare și răspuns. Pus în coadă și nu așteptat, ca și `processUpdate` însuși.
    // Rulează și după o eroare — mesajele s-au scris oricum în istoric.
    this.queue('intretineRezumat', {});
  }
}
