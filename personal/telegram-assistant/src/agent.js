import { Agent } from 'agents';
import { buildSystemPrompt, buildDateContext } from './prompt.js';
import { runToolLoop } from './anthropic.js';
import { TOOL_DEFINITIONS, executeTool } from './tools/index.js';
import { listEventsForDate } from './tools/calendar.js';
import { sendTelegramMessage, isPrivateTextMessage } from './telegram.js';
import { nextDailyRunAt, isoDateInTimeZone } from './datetime.js';
import { formatDailyAgenda } from './agenda.js';

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
        executeTool: (name, input) => executeTool(this.env, name, input),
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
