// Unelte de notificare: cum îl caută asistentul pe utilizator, nu invers.
//
// Ambele au nevoie de INSTANȚA agentului (`agent.schedule`, starea din SQL), la fel ca uneltele
// de aer condiționat — vezi nota din tools/index.js și runVoiceTool din agent.js.

import { localDateTimeToUtc } from '../datetime.js';

export const SCHEDULE_CALL_TOOL = {
  name: 'programeaza_apel',
  description:
    'Programează o notificare pe telefonul utilizatorului la o dată/oră viitoare, o singură ' +
    'dată sau zilnic. Utilizatorul o apasă și se deschide direct în conversație cu tine. ' +
    'Folosește-o când cere "sună-mă", "amintește-mi", "caută-mă" la un moment anume. ' +
    'NU o folosi pentru a nota un eveniment în calendar — aia e create_calendar_event.',
  input_schema: {
    type: 'object',
    properties: {
      titlu: {
        type: 'string',
        description: 'Titlul notificării, foarte scurt (2-4 cuvinte), ex: "Medicamente"',
      },
      text: {
        type: 'string',
        description:
          'Ce scrie în notificare — o propoziție, formulată ca și cum i-ai vorbi direct.',
      },
      run_at: {
        type: 'string',
        description: 'Data+ora locală, FĂRĂ offset UTC, ex: 2026-09-19T08:00:00. În viitor.',
      },
      repeta: {
        type: 'string',
        enum: ['none', 'daily'],
        description: '"none" = o singură dată; "daily" = în fiecare zi la aceeași oră',
      },
    },
    required: ['titlu', 'text', 'run_at', 'repeta'],
    additionalProperties: false,
  },
};

export async function programeazaApel(env, input, agent) {
  if (!agent) {
    const err = new Error('Unealta are nevoie de agent');
    err.code = 'AGENT_REQUIRED';
    throw err;
  }

  // Același tipar de validare ca la scheduleAirConditioner — data și ora se despart, fiindcă
  // `localDateTimeToUtc` le primește separat și aplică ora de vară/iarnă corect.
  const timeZone = env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec((input.run_at || '').trim());
  if (!match) {
    const err = new Error(`run_at invalid: "${input.run_at}". Format: 2026-09-19T08:00:00.`);
    err.code = 'NOTIF_BAD_DATETIME';
    throw err;
  }

  const la = localDateTimeToUtc(match[1], match[2], timeZone);
  if (la.getTime() <= Date.now()) {
    // Mesajul spune și CÂT E CEASUL, ca modelul să se poată corecta singur. Fără asta intra
    // într-o buclă: încerca altă oră, tot greșită, fiindcă nu știa de la ce să plece.
    const acum = new Intl.DateTimeFormat('sv-SE', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()).replace(' ', 'T');
    const err = new Error(
      `Ora cerută (${input.run_at}) e în trecut. Acum e ${acum}. Recalculează de la ora asta.`
    );
    err.code = 'NOTIF_PAST_DATETIME';
    throw err;
  }

  const payload = { titlu: input.titlu, text: input.text, repeta: input.repeta };
  const programare = await agent.schedule(la, 'runScheduledNotification', payload);

  return {
    ok: true,
    schedule_id: programare.id,
    descriere: `„${input.titlu}" la ${input.run_at}${input.repeta === 'daily' ? ', zilnic' : ''}`,
    // Spus explicit, ca asistentul să nu promită o notificare care n-are unde ajunge.
    // Dacă e false, programarea tot s-a făcut — doar că la ora aceea mesajul va pleca pe
    // Telegram, nu pe telefon.
    telefon_abonat: await agent.poateAjungeLaTelefon(),
  };
}

export const NOTIFY_NOW_TOOL = {
  name: 'trimite_notificare',
  description:
    'Trimite ACUM o notificare pe telefonul utilizatorului. Folosește-o doar când cere explicit ' +
    'să fie anunțat imediat, sau ca să testați împreună că notificările funcționează. Pentru ' +
    'ceva la o oră viitoare folosește programeaza_apel.',
  input_schema: {
    type: 'object',
    properties: {
      titlu: { type: 'string', description: 'Titlu foarte scurt' },
      text: { type: 'string', description: 'O propoziție' },
    },
    required: ['titlu', 'text'],
    additionalProperties: false,
  },
};

export async function trimiteNotificare(env, input, agent) {
  if (!agent) {
    const err = new Error('Unealta are nevoie de agent');
    err.code = 'AGENT_REQUIRED';
    throw err;
  }
  const rezultat = await agent.notificaPeTelefon(input.titlu, input.text);
  return rezultat.ok ? { ok: true } : { ok: false, motiv: rezultat.motiv };
}
