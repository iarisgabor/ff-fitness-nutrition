// Client minimal pentru API-ul NEOFICIAL al Alexa (același pe care îl folosesc aplicația Alexa,
// alexa.amazon.de și proiectele alexa-remote2 / ioBroker.alexa2), scris doar cu fetch().
//
// Autentificare: un refresh token obținut o singură dată prin logarea cu proxy (vezi README) —
// secretul ALEXA_REFRESH_TOKEN. Din el cerem cookie-uri de sesiune pentru amazon.de
// (/ap/exchangetoken/cookies), apoi un token csrf (/api/language). Sesiunea se ține în SQL-ul
// agentului o zi; la 401 se reface o dată.
//
// ATENȚIE: refresh token-ul dă acces la contul Amazon. Nu se loghează niciodată, nici el, nici
// cookie-urile.

const API_USER_AGENT = 'AmazonWebView/Amazon Alexa/2.2.651540.0/iOS/18.3.1/iPhone';
const ALEXA_USER_AGENT = 'AppleWebKit PitanguiBridge/2.2.595606.0-[HARDWARE=iPhone14_7][SOFTWARE=17.4.1][DEVICE=iPhone]';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_KEY = 'alexa_session';

function alexaError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function config(env) {
  const page = (env.ALEXA_AMAZON_PAGE || 'amazon.de').trim();
  return {
    page,
    apiHost: (env.ALEXA_API_HOST || `alexa.${page}`).trim(),
    appName: (env.ALEXA_DEVICE_APP_NAME || 'ioBroker Alexa2').trim(),
    refreshToken: (env.ALEXA_REFRESH_TOKEN || '').trim(),
  };
}

function parseCookieHeader(str) {
  const jar = {};
  for (const part of (str || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return jar;
}

function mergeSetCookies(jar, headers) {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  for (const line of list) {
    const first = line.split(';')[0];
    const i = first.indexOf('=');
    if (i > 0) jar[first.slice(0, i).trim()] = first.slice(i + 1).trim();
  }
  return jar;
}

const serializeJar = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

async function createSession(env) {
  const cfg = config(env);
  if (!cfg.refreshToken) {
    throw alexaError('ALEXA_AUTH_MISSING', 'ALEXA_REFRESH_TOKEN nu e setat ca secret în Worker.');
  }

  const res = await fetch(`https://www.${cfg.page}/ap/exchangetoken/cookies`, {
    method: 'POST',
    headers: {
      'User-Agent': API_USER_AGENT,
      'Accept-Language': 'en-GB',
      'Accept-Charset': 'utf-8',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
      'x-amzn-identity-auth-domain': `api.${cfg.page}`,
    },
    body: new URLSearchParams({
      'di.os.name': 'iOS',
      app_version: '2.2.651540.0',
      domain: `.${cfg.page}`,
      source_token: cfg.refreshToken,
      requested_token_type: 'auth_cookies',
      source_token_type: 'refresh_token',
      'di.hw.version': 'iPhone',
      'di.sdk.version': '6.12.4',
      app_name: cfg.appName,
      'di.os.version': '16.6',
    }).toString(),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }
  const cookies = data?.response?.tokens?.cookies?.[`.${cfg.page}`];
  if (!res.ok || !Array.isArray(cookies)) {
    console.error('ALEXA_TOKEN_EXCHANGE_FAILED', res.status, data?.response?.error?.code || '');
    throw alexaError(
      'ALEXA_AUTH_FAILED',
      'Amazon a refuzat reînnoirea sesiunii Alexa — probabil trebuie refăcută logarea (vezi README).'
    );
  }

  const jar = mergeSetCookies({}, res.headers);
  for (const c of cookies) jar[c.Name] = c.Value;

  // csrf: Amazon îl pune ca cookie la prima cerere autentificată către alexa.<page>.
  const csrfRes = await fetch(`https://alexa.${cfg.page}/api/language`, {
    headers: {
      'User-Agent': ALEXA_USER_AGENT,
      Referer: `https://alexa.${cfg.page}/spa/index.html`,
      Origin: `https://alexa.${cfg.page}`,
      Cookie: serializeJar(jar),
      Accept: '*/*',
    },
  });
  mergeSetCookies(jar, csrfRes.headers);
  if (!jar.csrf) {
    console.error('ALEXA_CSRF_MISSING', csrfRes.status);
    throw alexaError('ALEXA_AUTH_FAILED', 'Nu am putut obține tokenul csrf de la Alexa.');
  }

  return { cookie: serializeJar(jar), csrf: jar.csrf, createdAt: Date.now() };
}

// Sesiunea se ține în agent_meta (SQL-ul agentului) — supraviețuiește între treziri, fără să
// cerem cookie-uri noi la fiecare comandă.
async function getSession(env, agent, { force = false } = {}) {
  if (!force) {
    const rows = agent.sql`SELECT value FROM agent_meta WHERE key = ${SESSION_KEY}`;
    if (rows.length > 0) {
      const saved = JSON.parse(rows[0].value);
      if (Date.now() - saved.createdAt < SESSION_TTL_MS) return saved;
    }
  }
  const session = await createSession(env);
  agent.sql`INSERT OR REPLACE INTO agent_meta (key, value) VALUES (${SESSION_KEY}, ${JSON.stringify(session)})`;
  return session;
}

export async function alexaRequest(env, agent, path, { method = 'GET', body } = {}) {
  const cfg = config(env);
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getSession(env, agent, { force: attempt > 0 });
    const res = await fetch(`https://${cfg.apiHost}${path}`, {
      method,
      headers: {
        'User-Agent': ALEXA_USER_AGENT,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json; charset=utf-8',
        'Accept-Language': 'en-GB',
        Referer: `https://alexa.${cfg.page}/spa/index.html`,
        Origin: `https://alexa.${cfg.page}`,
        csrf: session.csrf,
        Cookie: session.cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 401 && attempt === 0) continue; // sesiune expirată → o refacem o dată

    const text = await res.text();
    if (!res.ok) {
      console.error('ALEXA_REQUEST_FAILED', method, path, res.status, text.slice(0, 300));
      throw alexaError('ALEXA_REQUEST_FAILED', `Alexa a răspuns ${res.status} la ${path}.`);
    }
    return text ? JSON.parse(text) : {};
  }
  throw alexaError('ALEXA_AUTH_FAILED', 'Sesiunea Alexa a expirat și nu s-a putut reface.');
}

// --- Smart home ---------------------------------------------------------------------------

// entityId (UUID) pentru comenzi, applianceId (SKILL_...) pentru citirea stării — Alexa le
// cere diferit; ambele vin din getSmarthomeDevicesV2 la configurare (vezi README).
export async function executeSmarthomeAction(env, agent, entityId, parameters) {
  const res = await alexaRequest(env, agent, '/api/phoenix/state', {
    method: 'PUT',
    body: { controlRequests: [{ entityId, entityType: 'APPLIANCE', parameters }] },
  });
  const ok = res.controlResponses?.[0]?.code === 'SUCCESS';
  if (!ok) {
    const code = res.errors?.[0]?.code || 'UNKNOWN';
    console.error('ALEXA_ACTION_FAILED', parameters.action, code);
    const err = alexaError('ALEXA_ACTION_FAILED', `Alexa a refuzat comanda ${parameters.action} (${code}).`);
    err.alexaCode = code;
    throw err;
  }
}

export async function querySmarthomeState(env, agent, applianceId) {
  const res = await alexaRequest(env, agent, '/api/phoenix/state', {
    method: 'POST',
    body: { stateRequests: [{ entityId: applianceId, entityType: 'APPLIANCE' }] },
  });
  const device = res.deviceStates?.[0];
  if (!device) {
    const code = res.errors?.[0]?.code || 'UNKNOWN';
    throw alexaError('ALEXA_STATE_FAILED', `Alexa nu a întors starea aparatului (${code}).`);
  }
  const state = {};
  for (const raw of device.capabilityStates || []) {
    const s = JSON.parse(raw);
    state[s.name] = s.value && typeof s.value === 'object' && 'value' in s.value ? s.value.value : s.value;
  }
  return state;
}
