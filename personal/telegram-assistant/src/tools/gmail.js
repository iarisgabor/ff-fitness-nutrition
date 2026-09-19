// Gmail: CITIRE și CIORNE. Nicio unealtă nu trimite.
//
// Asta nu e o limitare de permisiuni, e o limitare de cod, și diferența contează: scope-ul
// `gmail.compose` permite tehnic și trimiterea. Ce garantează că Jarvis nu trimite un email e că
// endpoint-ul de trimitere al Gmail nu e chemat nicăieri în fișierul ăsta — și trebuie să rămână
// așa. Un email plecat din greșeală nu se ia înapoi și ajunge la altcineva decât la om.
// Ciorna se face aici, butonul „Trimite" rămâne al lui.
//
// Verificarea e un grep după calea acelui endpoint (comanda exactă e în README, la secțiunea de
// Gmail). Trebuie să întoarcă ZERO rezultate — de-aia calea nu se scrie nici măcar în
// comentariile de aici: un singur rând de zgomot transformă verificarea în ceva ce înveți să ignori.
//
// Tiparul de autentificare e cel din calendar.js (fetch simplu, fără SDK, cache pe isolate), cu
// credențiale SEPARATE: `GMAIL_*`, nu `GOOGLE_CALENDAR_*`. Regula 13 din CLAUDE.md a decis deja
// separarea, iar aici mai e un motiv practic: cache-ul de token se invalidează pe 401/403, deci
// un 403 de Gmail (API neactivat, scope neacordat) ar doborî și calendarul dacă ar împărți
// același token.

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Cât dintr-un email ajunge la model. Un email lung (fir cu zece răspunsuri citate) ar umple
// contextul cu ce s-a mai spus deja, în dauna conversației.
const MAX_CARACTERE_CORP = 4000;

let tokenCache = null;

async function getGmailAccessToken(env) {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value;

  const clientId = (env.GMAIL_CLIENT_ID || '').trim();
  const clientSecret = (env.GMAIL_CLIENT_SECRET || '').trim();
  const refreshToken = (env.GMAIL_REFRESH_TOKEN || '').trim();

  if (!clientId || !clientSecret || !refreshToken) {
    const err = new Error('Gmail nu e configurat (lipsesc GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN).');
    err.code = 'GMAIL_NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }

  if (!res.ok || !data?.access_token) {
    const err = new Error('Gmail token exchange failed');
    err.code = 'GMAIL_AUTH_FAILED';
    err.detail = data || `HTTP ${res.status}`;
    console.error('GMAIL_AUTH_FAILED', JSON.stringify(err.detail));
    throw err;
  }

  // Marjă de 60 s, ca la calendar.js: un token care expiră între verificare și cerere ar da un
  // 401 pe care nu-l putem deosebi de o problemă reală de autorizare.
  tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 - 60000 };
  return tokenCache.value;
}

async function apiGmail(env, cale, optiuni = {}) {
  const token = await getGmailAccessToken(env);
  const res = await fetch(`${GMAIL_API}${cale}`, {
    ...optiuni,
    headers: { authorization: `Bearer ${token}`, ...(optiuni.headers || {}) },
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    if (res.status === 401 || res.status === 403) tokenCache = null;
    const err = new Error(`Gmail ${cale} a răspuns ${res.status}: ${detail}`);
    err.code = res.status === 401 || res.status === 403 ? 'GMAIL_AUTH_FAILED' : 'GMAIL_REQUEST_FAILED';
    throw err;
  }

  return res.json();
}

// ─── Codare/decodare ─────────────────────────────────────────────────────────────────────────

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64UrlEncode(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Headerele de email nu pot conține UTF-8 brut. Fără asta, un subiect cu „ș" sau „ă" ajunge
// ilizibil în inboxul celuilalt (RFC 2047).
function encodeMimeHeaderWord(text) {
  return `=?UTF-8?B?${uint8ArrayToBase64(new TextEncoder().encode(text))}?=`;
}

function base64UrlDecode(text) {
  const base64 = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binar = atob(base64);
    const bytes = new Uint8Array(binar.length);
    for (let i = 0; i < binar.length; i++) bytes[i] = binar.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function headerul(mesaj, nume) {
  const gasit = (mesaj?.payload?.headers || []).find(
    (h) => String(h.name).toLowerCase() === nume.toLowerCase()
  );
  return gasit ? gasit.value : '';
}

// Corpul unui email, ales din arborele de părți MIME. `text/plain` întâi — e chiar ce a scris
// omul. `text/html` e retragerea, curățată de taguri, fiindcă multe emailuri n-au deloc parte
// text (newslettere, clienți care trimit doar HTML).
function extrageCorp(parte) {
  if (!parte) return '';

  if (parte.mimeType === 'text/plain' && parte.body?.data) return base64UrlDecode(parte.body.data);

  if (parte.parts) {
    for (const sub of parte.parts) {
      const text = extrageCorp(sub);
      if (text) return text;
    }
  }

  if (parte.mimeType === 'text/html' && parte.body?.data) {
    return base64UrlDecode(parte.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return '';
}

async function listeazaMesaje(env, query, limita) {
  const url = `/messages?q=${encodeURIComponent(query)}&maxResults=${Math.min(Number(limita) || 10, 25)}`;
  const lista = await apiGmail(env, url);
  const ids = (lista.messages || []).map((m) => m.id);
  if (ids.length === 0) return [];

  // Doar METADATE, nu corpuri: zece emailuri întregi ar umple contextul și ar trage corespondență
  // privată în model fără ca cineva s-o fi cerut. „Cine mi-a scris și despre ce" se răspunde din
  // expeditor + subiect + snippet; pentru restul există `citeste_email`.
  const mesaje = await Promise.all(
    ids.map((id) =>
      apiGmail(env, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
    )
  );

  return mesaje.map((m) => ({
    id: m.id,
    de_la: headerul(m, 'From'),
    subiect: headerul(m, 'Subject') || '(fără subiect)',
    cand: headerul(m, 'Date'),
    necitit: (m.labelIds || []).includes('UNREAD'),
    inceput: m.snippet || '',
  }));
}

// ─── Unelte ──────────────────────────────────────────────────────────────────────────────────

export const CAUTA_EMAILURI_TOOL = {
  name: 'cauta_emailuri',
  description:
    'Caută în Gmail-ul utilizatorului și întoarce expeditorul, subiectul, data și începutul ' +
    'fiecărui mesaj (nu textul întreg — pentru el există citeste_email). Interogarea e în ' +
    'sintaxa Gmail: "from:ana", "is:unread", "newer_than:3d", "has:attachment", "subject:factura", ' +
    'și se pot combina ("from:ana is:unread"). Folosește-o când întreabă dacă i-a scris cineva, ' +
    'ce i-a scris cineva anume, sau caută un email despre un subiect.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Interogare în sintaxa Gmail.' },
      limita: { type: 'number', description: 'Câte mesaje să întoarcă (implicit 10, maximum 25).' },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

export async function cautaEmailuri(env, input) {
  const mesaje = await listeazaMesaje(env, input.query, input.limita || 10);
  if (mesaje.length === 0) {
    return { mesaje: [], nota: 'Nu am găsit niciun email pentru căutarea asta.' };
  }
  return { mesaje };
}

export const REZUMAT_INBOX_TOOL = {
  name: 'rezumat_inbox',
  description:
    'Ce a venit necitit în inbox în ultimele ore. Folosește-o la întrebări de tipul „ce am pe ' +
    'mail?", „am ceva important?", „ce a venit azi?" — ca să nu fie nevoie să compui tu o ' +
    'interogare Gmail. Spune expeditorul și subiectul fiecăruia, și zi care par să ceară un ' +
    'răspuns. Nu citi emailuri întregi decât dacă ți se cere.',
  input_schema: {
    type: 'object',
    properties: {
      ore: { type: 'number', description: 'Câte ore în urmă să se uite (implicit 24).' },
    },
    required: [],
    additionalProperties: false,
  },
};

export async function rezumatInbox(env, input) {
  const ore = Math.max(1, Number(input.ore) || 24);
  // Gmail nu are filtru pe ore; `newer_than` merge în zile, deci rotunjim în sus și lăsăm
  // afișarea datei să facă restul.
  const zile = Math.max(1, Math.ceil(ore / 24));
  const mesaje = await listeazaMesaje(env, `in:inbox is:unread newer_than:${zile}d`, 15);

  if (mesaje.length === 0) {
    return { mesaje: [], nota: `Nu e nimic necitit în inbox din ultimele ${zile === 1 ? '24 de ore' : `${zile} zile`}.` };
  }
  return { mesaje, necitite: mesaje.length };
}

export const CITESTE_EMAIL_TOOL = {
  name: 'citeste_email',
  description:
    'Textul întreg al unui email, după id-ul lui (ia-l din cauta_emailuri sau rezumat_inbox — ' +
    'nu-l inventa). Folosește-o când vrea să știe ce scrie exact, sau înainte să compui un ' +
    'răspuns. În voce NU citi tot emailul cu voce tare decât dacă ți-o cere: spune pe scurt ' +
    'despre ce e.',
  input_schema: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Id-ul mesajului.' },
    },
    required: ['message_id'],
    additionalProperties: false,
  },
};

export async function citesteEmail(env, input) {
  const mesaj = await apiGmail(env, `/messages/${encodeURIComponent(input.message_id)}?format=full`);
  const corp = extrageCorp(mesaj.payload).trim();
  const taiat = corp.length > MAX_CARACTERE_CORP;

  return {
    id: mesaj.id,
    thread_id: mesaj.threadId,
    de_la: headerul(mesaj, 'From'),
    catre: headerul(mesaj, 'To'),
    subiect: headerul(mesaj, 'Subject') || '(fără subiect)',
    cand: headerul(mesaj, 'Date'),
    text: taiat ? `${corp.slice(0, MAX_CARACTERE_CORP)}\n\n[…restul emailului e mai lung și a fost tăiat]` : corp,
  };
}

export const CREEAZA_CIORNA_TOOL = {
  name: 'creeaza_ciorna',
  description:
    'Scrie un email și îl lasă ca CIORNĂ în Gmail. NU îl trimite — trimiterea rămâne a ' +
    'utilizatorului, care deschide ciorna și apasă el butonul. Spune-i asta de fiecare dată, ' +
    'clar, ca să nu creadă că emailul a plecat. Pentru un răspuns la un email primit, dă și ' +
    'raspunde_la_message_id, ca ciorna să intre în același fir de conversație.',
  input_schema: {
    type: 'object',
    properties: {
      catre: { type: 'string', description: 'Adresa destinatarului (doar adresa, fără nume și fără paranteze unghiulare).' },
      subiect: { type: 'string', description: 'Subiectul. La un răspuns, lasă gol ca să se folosească „Re: <subiectul original>".' },
      text: { type: 'string', description: 'Textul emailului, în română, cu diacritice.' },
      raspunde_la_message_id: {
        type: 'string',
        description: 'Id-ul emailului la care răspunde, din cauta_emailuri/citeste_email. Gol dacă e un email nou.',
      },
    },
    required: ['catre', 'subiect', 'text', 'raspunde_la_message_id'],
    additionalProperties: false,
  },
};

export async function creeazaCiorna(env, input) {
  const catre = String(input.catre || '').trim();
  const text = String(input.text || '');
  let subiect = String(input.subiect || '').trim();

  if (!catre || !text) {
    const err = new Error('O ciornă are nevoie măcar de un destinatar și de un text.');
    err.code = 'GMAIL_CIORNA_INCOMPLETA';
    throw err;
  }

  // Un răspuns are nevoie de trei lucruri ca să ATERIZEZE în firul original: `threadId` pentru
  // Gmail, și headerele In-Reply-To/References pentru clientul celuilalt. Fără ele, destinatarul
  // primește un mesaj orfan, fără legătură vizibilă cu ce a scris el.
  let threadId = null;
  let inReplyTo = '';
  let references = '';

  if (String(input.raspunde_la_message_id || '').trim()) {
    const original = await apiGmail(
      env,
      `/messages/${encodeURIComponent(input.raspunde_la_message_id.trim())}?format=metadata` +
        '&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject'
    );
    threadId = original.threadId || null;
    inReplyTo = headerul(original, 'Message-ID');
    references = [headerul(original, 'References'), inReplyTo].filter(Boolean).join(' ');

    if (!subiect) {
      const original_subiect = headerul(original, 'Subject') || '';
      subiect = /^re:/i.test(original_subiect) ? original_subiect : `Re: ${original_subiect}`.trim();
    }
  }

  const from = (env.GMAIL_FROM_ADDRESS || '').trim();
  const linii = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${catre}`,
    `Subject: ${encodeMimeHeaderWord(subiect || '(fără subiect)')}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references ? [`References: ${references}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    uint8ArrayToBase64(new TextEncoder().encode(text)),
  ];

  const ciorna = await apiGmail(env, '/drafts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        raw: base64UrlEncode(new TextEncoder().encode(linii.join('\r\n'))),
        ...(threadId ? { threadId } : {}),
      },
    }),
  });

  return {
    ok: true,
    draft_id: ciorna.id,
    catre,
    subiect: subiect || '(fără subiect)',
    in_fir: !!threadId,
    nota:
      'Ciorna e salvată în Gmail, la Drafts. NU a fost trimisă și nu o pot trimite eu — ' +
      'spune-i utilizatorului să o deschidă și să apese el Trimite.',
  };
}
