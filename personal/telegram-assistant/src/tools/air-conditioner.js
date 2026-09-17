import { localDateTimeToUtc, nextDailyRunAt } from '../datetime.js';
import { executeSmarthomeAction, querySmarthomeState } from '../alexa.js';

// Aerul condiționat (Sinclair, aplicația EWPE Smart) NU are API public. Drumul folosit:
// bot → API-ul neoficial Alexa (src/alexa.js) → skill-ul „EWPE Smart Home" → aparat.
// Ce expune skill-ul prin Alexa (verificat 17 sept 2026): pornit/oprit, temperatură setată,
// mod (COOL/HEAT testate), plus citire: pornit/oprit, mod, temperatură setată, temperatura din
// cameră. NU expune: ventilator, swing, turbo, silențios, sleep, lumină.
// Skill-ul REFUZĂ temperatura/modul cât aparatul e oprit (IncompatibleApplianceDriverResponseException).

export const AC_SCHEDULE_CALLBACK = 'runScheduledAirConditioner';

const MIN_TEMP = 16;
const MAX_TEMP = 30;
const MODES = ['COOL', 'HEAT', 'AUTO'];
const STEP_DELAY_MS = 1500; // pauză între comenzi — skill-ul EWPE le execută pe rând, prin cloud

function acError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function deviceIds(env) {
  const entityId = (env.ALEXA_AC_ENTITY_ID || '').trim();
  const applianceId = (env.ALEXA_AC_APPLIANCE_ID || '').trim();
  if (!entityId || !applianceId) {
    throw acError('AC_CONFIG_MISSING', 'ALEXA_AC_ENTITY_ID / ALEXA_AC_APPLIANCE_ID nu sunt configurate în wrangler.toml.');
  }
  return { entityId, applianceId };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readAcState(env, agent) {
  const { applianceId } = deviceIds(env);
  const s = await querySmarthomeState(env, agent, applianceId);
  return {
    pornit: s.powerState === 'ON',
    mod: s.thermostatMode ?? null,
    temperatura_setata: s.targetSetpoint ?? null,
    temperatura_camera: s.temperature ?? null,
    conectat: s.connectivity === 'OK',
  };
}

// Validează o cerere de comandă și o normalizează. Folosit și la programare, ca o cerere
// greșită să fie respinsă acum, nu abia când rulează.
function normalizeCommand(input) {
  const power = ['on', 'off', 'unchanged'].includes(input.power) ? input.power : 'unchanged';
  const mode = input.mode && input.mode !== 'unchanged' ? String(input.mode).toUpperCase() : null;
  const temperature = input.temperature === null || input.temperature === undefined ? null : Number(input.temperature);

  if (mode && !MODES.includes(mode)) {
    throw acError('AC_BAD_MODE', `Mod necunoscut: ${input.mode}. Moduri disponibile: ${MODES.join(', ')}.`);
  }
  if (temperature !== null && (!Number.isFinite(temperature) || temperature < MIN_TEMP || temperature > MAX_TEMP)) {
    throw acError('AC_BAD_TEMPERATURE', `Temperatura trebuie să fie între ${MIN_TEMP} și ${MAX_TEMP}°C.`);
  }
  if (power === 'off' && (mode || temperature !== null)) {
    throw acError('AC_CONFLICT', 'Nu pot seta mod/temperatură și opri aparatul în aceeași comandă.');
  }
  if (power === 'unchanged' && !mode && temperature === null) {
    throw acError('AC_EMPTY_COMMAND', 'Comanda nu schimbă nimic.');
  }
  return { power, mode, temperature: temperature === null ? null : Math.round(temperature * 2) / 2 };
}

// Ordinea contează: pornire → mod → temperatură (skill-ul le refuză pe ultimele cu aparatul
// oprit). Dacă nu cerem pornire dar aparatul e oprit, refuzăm clar în loc să trimitem
// comenzi care ar eșua cu o eroare criptică.
async function applyCommand(env, agent, command) {
  const { entityId } = deviceIds(env);
  const done = [];
  const act = async (label, parameters) => {
    if (done.length > 0) await sleep(STEP_DELAY_MS);
    await executeSmarthomeAction(env, agent, entityId, parameters);
    done.push(label);
  };

  if (command.power === 'unchanged') {
    const state = await readAcState(env, agent);
    if (!state.pornit) {
      throw acError(
        'AC_IS_OFF',
        'Aparatul e oprit, iar modul/temperatura se pot seta doar cu el pornit. Întreabă utilizatorul dacă vrea să-l pornească.'
      );
    }
  }

  try {
    if (command.power === 'off') {
      await act('oprit', { action: 'turnOff' });
    } else {
      if (command.power === 'on') await act('pornit', { action: 'turnOn' });
      if (command.mode) {
        await act(`mod ${command.mode}`, { action: 'setThermostatMode', 'thermostatMode.value': command.mode });
      }
      if (command.temperature !== null) {
        await act(`${command.temperature}°C`, {
          action: 'setTargetTemperature',
          'targetTemperature.value': command.temperature.toFixed(1),
          'targetTemperature.scale': 'celsius',
        });
      }
    }
  } catch (err) {
    if (done.length > 0) err.message += ` (reușit înainte de eroare: ${done.join(', ')})`;
    throw err;
  }

  await sleep(STEP_DELAY_MS); // lasă skill-ul să raporteze noua stare înainte s-o citim
  const state = await readAcState(env, agent).catch(() => null);
  return { ok: true, executat: done, stare_dupa: state };
}

function formatLocal(ms, timeZone) {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

function describeCommand(c) {
  if (c.power === 'off') return 'oprire';
  const parts = [];
  if (c.power === 'on') parts.push('pornire');
  if (c.mode) parts.push(`mod ${c.mode}`);
  if (c.temperature !== null) parts.push(`${c.temperature}°C`);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------------------------

const COMMAND_PROPERTIES = {
  power: {
    type: 'string',
    enum: ['on', 'off', 'unchanged'],
    description: '"on" pornește, "off" oprește, "unchanged" nu atinge alimentarea',
  },
  mode: {
    type: 'string',
    enum: ['COOL', 'HEAT', 'AUTO', 'unchanged'],
    description: 'COOL = răcire, HEAT = încălzire, AUTO = automat; "unchanged" dacă nu se cere',
  },
  temperature: {
    type: ['number', 'null'],
    description: `Temperatura dorită în °C (${MIN_TEMP}-${MAX_TEMP}), sau null dacă nu se cere`,
  },
};

export const GET_AIR_CONDITIONER_STATE_TOOL = {
  name: 'get_air_conditioner_state',
  description:
    'Citește starea curentă a aerului condiționat: pornit/oprit, mod, temperatura setată și ' +
    'temperatura din cameră.',
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
};

export async function getAirConditionerState(env, input, agent) {
  return readAcState(env, agent);
}

export const CONTROL_AIR_CONDITIONER_TOOL = {
  name: 'control_air_conditioner',
  description:
    'Comandă ACUM aerul condiționat: pornire/oprire, mod (răcire/încălzire/automat) și orice ' +
    `temperatură între ${MIN_TEMP} și ${MAX_TEMP}°C, într-un singur apel. Modul și temperatura ` +
    'merg doar cu aparatul pornit — dacă e oprit și utilizatorul cere o temperatură, folosește ' +
    'power "on". Întoarce și starea de după comandă.',
  input_schema: {
    type: 'object',
    properties: COMMAND_PROPERTIES,
    required: ['power', 'mode', 'temperature'],
    additionalProperties: false,
  },
};

export async function controlAirConditioner(env, input, agent) {
  return applyCommand(env, agent, normalizeCommand(input));
}

export const SCHEDULE_AIR_CONDITIONER_TOOL = {
  name: 'schedule_air_conditioner',
  description:
    'Programează o comandă de aer condiționat (aceiași parametri ca control_air_conditioner) la ' +
    'o dată/oră viitoare, o singură dată sau zilnic la aceeași oră.',
  input_schema: {
    type: 'object',
    properties: {
      ...COMMAND_PROPERTIES,
      run_at: {
        type: 'string',
        description: 'Data+ora locală, FĂRĂ offset UTC, ex: 2026-09-18T17:30:00. Trebuie să fie în viitor.',
      },
      repeat: {
        type: 'string',
        enum: ['none', 'daily'],
        description: '"none" = o singură dată; "daily" = în fiecare zi la aceeași oră, începând cu run_at',
      },
    },
    required: ['power', 'mode', 'temperature', 'run_at', 'repeat'],
    additionalProperties: false,
  },
};

export async function scheduleAirConditioner(env, input, agent) {
  const command = normalizeCommand(input);
  deviceIds(env);
  const timeZone = env.DEFAULT_TIMEZONE || 'Europe/Bucharest';

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec((input.run_at || '').trim());
  if (!match) {
    throw acError('AC_BAD_DATETIME', `run_at invalid: "${input.run_at}". Format: 2026-09-18T17:30:00.`);
  }
  const when = localDateTimeToUtc(match[1], match[2], timeZone);
  if (when.getTime() <= Date.now()) {
    throw acError('AC_PAST_DATETIME', 'Ora aleasă e deja în trecut.');
  }

  const [hour, minute] = match[2].split(':').map(Number);
  const payload = { command, repeat: input.repeat === 'daily' ? 'daily' : 'none', hour, minute };
  const schedule = await agent.schedule(when, AC_SCHEDULE_CALLBACK, payload);

  return {
    ok: true,
    schedule_id: schedule.id,
    comanda: describeCommand(command),
    repeat: payload.repeat,
    first_run: formatLocal(when.getTime(), timeZone),
  };
}

// Apelat de agent (callback-ul programării). Pentru „daily", își reprogramează singur următoarea
// rulare — ca sendDailyAgenda: un singur loc responsabil, fără cron UTC (ora de vară/iarnă).
// O programare nu poate întreba nimic, deci o comandă fără "on" cu aparatul oprit îl pornește.
export async function runScheduledAcCommand(env, payload, agent) {
  const timeZone = env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
  const command = { ...payload.command };
  if (command.power === 'unchanged') command.power = 'on';
  try {
    const result = await applyCommand(env, agent, command);
    return { ...result, descriere: describeCommand(payload.command) };
  } finally {
    if (payload.repeat === 'daily') {
      const next = nextDailyRunAt(timeZone, payload.hour, payload.minute);
      await agent.schedule(next, AC_SCHEDULE_CALLBACK, payload);
    }
  }
}

export const LIST_AIR_CONDITIONER_SCHEDULES_TOOL = {
  name: 'list_air_conditioner_schedules',
  description: 'Listează programările viitoare ale aerului condiționat (id, comandă, oră, repetare).',
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
};

export async function listAirConditionerSchedules(env, input, agent) {
  const timeZone = env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
  const all = await agent.listSchedules();
  const items = all
    .filter((s) => s.callback === AC_SCHEDULE_CALLBACK && s.payload?.command)
    .sort((a, b) => a.time - b.time)
    .map((s) => ({
      schedule_id: s.id,
      comanda: describeCommand(s.payload.command),
      repeat: s.payload.repeat,
      next_run: formatLocal(s.time * 1000, timeZone), // SDK-ul ține `time` în secunde
    }));
  return { schedules: items };
}

export const CANCEL_AIR_CONDITIONER_SCHEDULE_TOOL = {
  name: 'cancel_air_conditioner_schedule',
  description:
    'Anulează o programare a aerului condiționat (inclusiv una zilnică). schedule_id vine din ' +
    'list_air_conditioner_schedules — nu-l inventa.',
  input_schema: {
    type: 'object',
    properties: { schedule_id: { type: 'string' } },
    required: ['schedule_id'],
    additionalProperties: false,
  },
};

export async function cancelAirConditionerSchedule(env, input, agent) {
  const existing = await agent.listSchedules({ id: input.schedule_id });
  if (!existing.some((s) => s.callback === AC_SCHEDULE_CALLBACK)) {
    throw acError('AC_SCHEDULE_NOT_FOUND', `Nu există programarea "${input.schedule_id}".`);
  }
  await agent.cancelSchedule(input.schedule_id);
  return { ok: true };
}
