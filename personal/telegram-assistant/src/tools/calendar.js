import { localDateTimeToUtc } from '../datetime.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Cache la nivel de modul — trăiește cât ține isolate-ul Workers (adesea peste mai multe
// cereri), nu doar în cadrul unui singur tur de conversație. Un tur poate folosi 2+ unelte de
// calendar (find + update); fără cache, fiecare ar face propriul schimb OAuth cu Google, ceea
// ce e cea mai mare parte din latența resimțită de utilizator.
let cachedAccessToken = null;

// Apărare împotriva unui bug de generare observat la Claude: pentru câmpuri opționale unde
// convenția e "string gol dacă nu există/nu se schimbă", modelul trimite ocazional un fragment
// corupt din propriul format intern de apelare a uneltelor (ex. "</antml_parameter>") în loc de
// string gol. Text real (titluri, descrieri, locații, date) nu conține niciodată `<`/`>`, deci
// orice astfel de conținut e tratat ca și cum câmpul ar fi fost lăsat gol.
function sanitizeOptionalField(value, fieldName) {
  const raw = (value || '').trim();
  if (/[<>]/.test(raw)) {
    console.error('OPTIONAL_FIELD_SANITIZED', fieldName, JSON.stringify(raw));
    return '';
  }
  return raw;
}

export const CREATE_CALENDAR_EVENT_TOOL = {
  name: 'create_calendar_event',
  description:
    'Creează un eveniment în Google Calendar. Folosește-o când utilizatorul vrea să programeze, ' +
    'adauge sau noteze o întâlnire/eveniment cu dată și oră cunoscute. Dacă data sau ora nu sunt ' +
    'clare din conversație, pune o întrebare de clarificare în loc să apelezi această unealtă.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Titlu scurt al evenimentului' },
      start_datetime: {
        type: 'string',
        description: 'Data+ora de start, locală, FĂRĂ offset UTC, ex: 2026-08-22T15:00:00',
      },
      end_datetime: {
        type: 'string',
        description:
          'Data+ora de final, același format. Dacă utilizatorul nu specifică durata, ' +
          'folosește start_datetime + 1 oră.',
      },
      description: { type: 'string', description: 'Note suplimentare; string gol dacă nu există' },
      location: { type: 'string', description: 'Locație; string gol dacă nu există' },
    },
    required: ['title', 'start_datetime', 'end_datetime', 'description', 'location'],
    additionalProperties: false,
  },
};

// Tipar identic cu getGmailAccessToken din worker/index.js: fetch simplu, fără SDK Google,
// token de acces obținut din nou la fiecare apel (volum mic, nu justifică cache). .trim()
// defensiv — un \n rătăcit dintr-un `wrangler secret put` prin echo strică schimbul de token.
async function getGoogleCalendarAccessToken(env) {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now) {
    return cachedAccessToken.accessToken;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: (env.GOOGLE_CALENDAR_CLIENT_ID || '').trim(),
      client_secret: (env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim(),
      refresh_token: (env.GOOGLE_CALENDAR_REFRESH_TOKEN || '').trim(),
      grant_type: 'refresh_token',
    }).toString(),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }

  if (!res.ok || !data || !data.access_token) {
    cachedAccessToken = null;
    const err = new Error('Google Calendar token exchange failed');
    err.code = 'GOOGLE_AUTH_FAILED';
    err.detail = data || `HTTP ${res.status}`;
    console.error('GOOGLE_AUTH_FAILED', res.status, JSON.stringify(err.detail));
    throw err;
  }

  // Expiră cu 60s mai devreme decât spune Google, ca marjă de siguranță pentru latența cererii
  // care urmează să folosească tokenul.
  cachedAccessToken = {
    accessToken: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 3600) * 1000 - 60000,
  };
  return data.access_token;
}

export async function createCalendarEvent(env, input) {
  const accessToken = await getGoogleCalendarAccessToken(env);
  const timeZone = env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID || 'primary');

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.title,
        description: sanitizeOptionalField(input.description, 'create.description'),
        location: sanitizeOptionalField(input.location, 'create.location'),
        // Trimitem ora locală + fusul orar IANA separat — NU calculăm noi offset-ul (+2/+3),
        // altfel evenimentele ies la ora greșită la schimbarea orei de vară/iarnă.
        start: { dateTime: input.start_datetime, timeZone },
        end: { dateTime: input.end_datetime, timeZone },
      }),
    }
  );

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const err = new Error(`Calendar event insert failed (${res.status}): ${detail}`);
    if (res.status === 401 || res.status === 403) cachedAccessToken = null;
    err.code = res.status === 401 || res.status === 403 ? 'GOOGLE_AUTH_FAILED' : 'CALENDAR_INSERT_FAILED';
    throw err;
  }

  const data = await res.json();
  return { ok: true, htmlLink: data.htmlLink };
}

export const FIND_CALENDAR_EVENTS_TOOL = {
  name: 'find_calendar_events',
  description:
    'Caută evenimente în Google Calendar într-un interval de date, opțional filtrate după un text ' +
    'din titlu/descriere. Folosește-o ÎNTOTDEAUNA înainte de update_calendar_event sau ' +
    'delete_calendar_event, ca să afli event_id-ul corect — nu inventa niciodată un event_id. ' +
    'Returnează, pentru fiecare eveniment găsit, id, titlu, dată/oră de start și final și locație.',
  input_schema: {
    type: 'object',
    properties: {
      date_from: { type: 'string', description: 'Prima zi a intervalului de căutare, YYYY-MM-DD' },
      date_to: {
        type: 'string',
        description: 'Ultima zi a intervalului (inclusiv), YYYY-MM-DD. Identică cu date_from pentru o singură zi.',
      },
      query: {
        type: 'string',
        description:
          'Text EXACT de căutat în titlu/descriere, doar dacă utilizatorul a menționat explicit un nume/subiect ' +
          '(ex. "Andreea", "dentist"). Dacă utilizatorul vrea doar lista completă a evenimentelor dintr-un interval ' +
          '(ex. "ce am mâine"), trimite literal un string gol "" — NU inventa, nu completa și nu scrie alt text aici.',
      },
    },
    required: ['date_from', 'date_to', 'query'],
    additionalProperties: false,
  },
};

export async function findCalendarEvents(env, input) {
  const accessToken = await getGoogleCalendarAccessToken(env);
  const timeZone = env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID || 'primary');

  const timeMin = localDateTimeToUtc(input.date_from, '00:00:00', timeZone);
  const timeMax = localDateTimeToUtc(input.date_to, '23:59:59', timeZone);

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
  url.searchParams.set('timeMin', timeMin.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeZone', timeZone);
  const query = sanitizeOptionalField(input.query, 'find.query');
  if (query) url.searchParams.set('q', query);

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const err = new Error(`Calendar events search failed (${res.status}): ${detail}`);
    if (res.status === 401 || res.status === 403) cachedAccessToken = null;
    err.code = res.status === 401 || res.status === 403 ? 'GOOGLE_AUTH_FAILED' : 'CALENDAR_LIST_FAILED';
    throw err;
  }

  const data = await res.json();
  return {
    events: (data.items || []).map((item) => ({
      id: item.id,
      title: item.summary || '(fără titlu)',
      start: item.start?.dateTime || item.start?.date,
      end: item.end?.dateTime || item.end?.date,
      location: item.location || '',
      allDay: !item.start?.dateTime,
    })),
  };
}

export const UPDATE_CALENDAR_EVENT_TOOL = {
  name: 'update_calendar_event',
  description:
    'Modifică un eveniment existent din Google Calendar, identificat prin event_id (obținut din ' +
    'find_calendar_events — nu inventa niciodată un event_id). Completează doar câmpurile pe care ' +
    'utilizatorul chiar vrea să le schimbe; lasă string gol la restul, ca să rămână neschimbate.',
  input_schema: {
    type: 'object',
    properties: {
      event_id: { type: 'string', description: 'ID-ul evenimentului, obținut din find_calendar_events' },
      title: { type: 'string', description: 'Titlu nou; string gol dacă nu se schimbă' },
      start_datetime: {
        type: 'string',
        description: 'Dată+oră nouă de start, locală, fără offset UTC, ex: 2026-08-22T15:00:00; string gol dacă nu se schimbă',
      },
      end_datetime: {
        type: 'string',
        description: 'Dată+oră nouă de final, același format; string gol dacă nu se schimbă',
      },
      description: { type: 'string', description: 'Note noi; string gol dacă nu se schimbă' },
      location: { type: 'string', description: 'Locație nouă; string gol dacă nu se schimbă' },
    },
    required: ['event_id', 'title', 'start_datetime', 'end_datetime', 'description', 'location'],
    additionalProperties: false,
  },
};

export async function updateCalendarEvent(env, input) {
  const accessToken = await getGoogleCalendarAccessToken(env);
  const timeZone = env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID || 'primary');

  // PATCH (nu PUT) — trimitem doar câmpurile completate de utilizator, restul evenimentului
  // rămâne neatins. String gol în input înseamnă "nu schimba acest câmp", nu "șterge-l".
  const title = sanitizeOptionalField(input.title, 'update.title');
  const description = sanitizeOptionalField(input.description, 'update.description');
  const location = sanitizeOptionalField(input.location, 'update.location');
  const startDatetime = sanitizeOptionalField(input.start_datetime, 'update.start_datetime');
  const endDatetime = sanitizeOptionalField(input.end_datetime, 'update.end_datetime');

  const body = {};
  if (title) body.summary = title;
  if (description) body.description = description;
  if (location) body.location = location;
  if (startDatetime) body.start = { dateTime: startDatetime, timeZone };
  if (endDatetime) body.end = { dateTime: endDatetime, timeZone };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(input.event_id)}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const err = new Error(`Calendar event update failed (${res.status}): ${detail}`);
    if (res.status === 401 || res.status === 403) cachedAccessToken = null;
    err.code = res.status === 401 || res.status === 403 ? 'GOOGLE_AUTH_FAILED' : 'CALENDAR_UPDATE_FAILED';
    throw err;
  }

  const data = await res.json();
  return { ok: true, htmlLink: data.htmlLink };
}

export const DELETE_CALENDAR_EVENT_TOOL = {
  name: 'delete_calendar_event',
  description:
    'Șterge definitiv un eveniment din Google Calendar, identificat prin event_id (obținut din ' +
    'find_calendar_events — nu inventa niciodată un event_id). Folosește-o DOAR după ce ai identificat ' +
    'exact evenimentul (un singur rezultat neambiguu) și utilizatorul a confirmat clar ștergerea lui.',
  input_schema: {
    type: 'object',
    properties: {
      event_id: { type: 'string', description: 'ID-ul evenimentului de șters, obținut din find_calendar_events' },
    },
    required: ['event_id'],
    additionalProperties: false,
  },
};

export async function deleteCalendarEvent(env, input) {
  const accessToken = await getGoogleCalendarAccessToken(env);
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID || 'primary');

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(input.event_id)}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
    }
  );

  // Google răspunde 204 (fără body) la succes; 410 dacă evenimentul era deja șters — tratăm
  // și 410 ca succes, starea dorită de utilizator (evenimentul nu mai există) e deja atinsă.
  if (!res.ok && res.status !== 410) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const err = new Error(`Calendar event delete failed (${res.status}): ${detail}`);
    if (res.status === 401 || res.status === 403) cachedAccessToken = null;
    err.code = res.status === 401 || res.status === 403 ? 'GOOGLE_AUTH_FAILED' : 'CALENDAR_DELETE_FAILED';
    throw err;
  }

  return { ok: true };
}

// Folosit de agenda zilnică programată (agent.js) — citește evenimentele dintr-o zi
// calendaristică (YYYY-MM-DD), interpretată în DEFAULT_TIMEZONE.
export async function listEventsForDate(env, isoDate) {
  const accessToken = await getGoogleCalendarAccessToken(env);
  const timeZone = env.DEFAULT_TIMEZONE || 'Europe/Bucharest';
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID || 'primary');

  // events.list cere timeMin/timeMax cu offset explicit (spre deosebire de events.insert, care
  // acceptă oră locală "naivă" + câmp timeZone separat) — de-aia convertim explicit în UTC aici.
  const timeMin = localDateTimeToUtc(isoDate, '00:00:00', timeZone);
  const timeMax = localDateTimeToUtc(isoDate, '23:59:59', timeZone);

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
  url.searchParams.set('timeMin', timeMin.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeZone', timeZone);

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    const err = new Error(`Calendar events list failed (${res.status}): ${detail}`);
    if (res.status === 401 || res.status === 403) cachedAccessToken = null;
    err.code = res.status === 401 || res.status === 403 ? 'GOOGLE_AUTH_FAILED' : 'CALENDAR_LIST_FAILED';
    throw err;
  }

  const data = await res.json();
  return (data.items || []).map((item) => ({
    title: item.summary || '(fără titlu)',
    start: item.start?.dateTime || item.start?.date,
    end: item.end?.dateTime || item.end?.date,
    allDay: !item.start?.dateTime,
  }));
}
