import { Agent } from 'agents';
import { buildSystemPrompt, buildDateContext } from './prompt.js';
import { runToolLoop } from './anthropic.js';
import { TOOL_DEFINITIONS, executeTool } from './tools/index.js';
import { listEventsForDate } from './tools/calendar.js';
import { sendTelegramMessage, isPrivateTextMessage } from './telegram.js';
import { nextDailyRunAt, isoDateInTimeZone } from './datetime.js';
import { formatDailyAgenda } from './agenda.js';
import { runScheduledAcCommand } from './tools/air-conditioner.js';
import { sendPush } from './push.js';

const HISTORY_WINDOW = 20;
const DAILY_AGENDA_CALLBACK = 'sendDailyAgenda';
const DAILY_AGENDA_MINUTE = 0;

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
    await this.ensureDailyAgendaScheduled();
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

  // Conversația vocală ajunge în același tabel `messages` ca cea din Telegram — un singur fir,
  // indiferent de canal. Vine din inputAudioTranscription/outputAudioTranscription (Gemini Live).
  async saveVoiceTranscript(role, text) {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return;
    this.sql`INSERT INTO messages (role, content) VALUES (${role}, ${JSON.stringify(clean)})`;
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

    this.sql`INSERT INTO messages (role, content) VALUES ('user', ${JSON.stringify(userText)})`;

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
        messages,
        tools: TOOL_DEFINITIONS,
        executeTool: (name, input) => executeTool(this.env, name, input, this),
      });

      this.sql`INSERT INTO messages (role, content) VALUES ('assistant', ${JSON.stringify(replyText)})`;
      await sendTelegramMessage(this.env, { chatId, text: replyText });
    } catch (err) {
      const friendly = ERROR_MESSAGES[err.code] ?? 'A apărut o eroare neașteptată. Încearcă din nou.';
      if (friendly) {
        await sendTelegramMessage(this.env, { chatId, text: friendly }).catch(() => {});
      }
    }
  }
}
