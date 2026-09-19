// Spotify — ce ascultă, ce pornește, și playlisturi făcute pe loc, după stare.
//
// Autentificare: Authorization Code. Se face o singură dată, dintr-un browser, prin rutele
// `/spotify/auth` și `/spotify/callback` din `src/index.js` (vezi README).
//
// Spre deosebire de restul secretelor, refresh token-ul NU se pune cu mâna: se naște în urma
// autorizării, adică e deja în Worker în clipa în care ar trebui copiat. Se salvează singur în
// `agent_meta` (vezi agent.js). Un `SPOTIFY_REFRESH_TOKEN` pus totuși ca secret are prioritate.
//
// DOUĂ limite ale platformei, care se văd în felul în care sunt scrise uneltele:
//
// 1. **Doar REDAREA cere Premium.** Un cont gratuit poate căuta și poate crea playlisturi; doar
//    `PUT /me/player/play` și frații lui întorc 403 cu `reason: PREMIUM_REQUIRED`.
//
//    ATENȚIE la capcana în care am căzut deja: 403 mai vine și pentru SCOPE LIPSĂ, iar dacă îl
//    traduci automat în „n-ai Premium", un abonat Premium primește exact mesajul ăla când cere
//    un playlist. Scope-urile se fixează la autorizare — dacă adaugi unul în listă, trebuie
//    refăcută autorizarea, altfel refresh token-ul vechi continuă să nu-l aibă. Vezi `api()`.
//
// 2. **`/recommendations` și `/audio-features` NU mai sunt disponibile** pentru aplicații noi
//    (Spotify le-a închis în noiembrie 2024). Adică exact endpoint-urile pe care le-ai folosi
//    pentru „fă-mi un playlist după starea asta". Aici facem altfel, și e chiar mai bine:
//    starea o traduce MODELUL în căutări concrete (artiști, genuri, cuvinte), iar unealta doar
//    caută și adună. Un model de limbaj știe ce înseamnă „ceva melancolic de toamnă" mai bine
//    decât un vector de „valence" și „energy".

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

// Token-ul de acces ține o oră. Cache la nivel de izolat, ca la calendar: un apel vocal face
// mai multe cereri la rând, n-are rost să reînnoim la fiecare.
let tokenCache = null;
let profilCache = null;

async function cereConfig(env, agent) {
  const id = (env.SPOTIFY_CLIENT_ID || '').trim();
  const secret = (env.SPOTIFY_CLIENT_SECRET || '').trim();
  // Secretul are prioritate; altfel, cel salvat la autorizare (vezi agent.js).
  const refresh =
    (env.SPOTIFY_REFRESH_TOKEN || '').trim() ||
    (agent ? ((await agent.getSpotifyToken()) || '').trim() : '');
  if (!id || !secret || !refresh) {
    const err = new Error(
      'Spotify nu e conectat încă. Trebuie făcută o singură dată autorizarea (vezi README).'
    );
    err.code = 'SPOTIFY_NOT_CONFIGURED';
    throw err;
  }
  return { id, secret, refresh };
}

async function getToken(env, agent, reinnoieste = false) {
  if (!reinnoieste && tokenCache && tokenCache.expira > Date.now()) return tokenCache.token;

  const { id, secret, refresh } = await cereConfig(env, agent);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // Spotify vrea client_id:client_secret în Basic, nu în corp.
      authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }).toString(),
  });

  const date = await res.json().catch(() => null);
  if (!res.ok || !date?.access_token) {
    tokenCache = null;
    const err = new Error(
      'Autentificarea la Spotify a eșuat — probabil trebuie refăcută autorizarea.'
    );
    err.code = 'SPOTIFY_AUTH_FAILED';
    throw err;
  }

  tokenCache = {
    token: date.access_token,
    // Un minut rezervă: altfel o cerere pornită fix la expirare pică degeaba.
    expira: Date.now() + (date.expires_in || 3600) * 1000 - 60000,
  };
  return tokenCache.token;
}

async function api(env, agent, cale, optiuni = {}) {
  const cerere = async (token) =>
    fetch(`${API}${cale}`, {
      method: optiuni.method || 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(optiuni.body ? { 'content-type': 'application/json' } : {}),
      },
      body: optiuni.body ? JSON.stringify(optiuni.body) : undefined,
    });

  let res = await cerere(await getToken(env, agent));
  if (res.status === 401) res = await cerere(await getToken(env, agent, true)); // expirat devreme

  // 204 = a mers, dar n-are ce întoarce (pauză, următoarea, transfer). 404 pe /me/player
  // înseamnă „niciun dispozitiv activ", nu „ruta nu există".
  if (res.status === 204) return null;

  // 5xx = Spotify a căzut o clipă, nu am greșit noi ceva. S-a văzut în loguri: o căutare
  // („Mii de laude") a răspuns 502, cu corp de pagină de eroare, deși piesa există în catalog.
  // Pentru om, asta iese ca „nu găsesc piesa" — cel mai înșelător mesaj posibil, fiindcă
  // trimite căutarea altundeva: la numele piesei, la cont, la permisiuni.
  //
  // O singură reîncercare, după o scurtă pauză. Mai multe n-ar ajuta: în voce, omul așteaptă.
  if (res.status >= 500 && !optiuni.__reincercat5xx) {
    console.warn('SPOTIFY_5XX', res.status, cale, 'reincerc o data');
    await new Promise((gata) => setTimeout(gata, 400));
    return api(env, agent, cale, { ...optiuni, __reincercat5xx: true });
  }

  // 403 NU înseamnă „n-ai Premium". Aici era o minciună costisitoare.
  //
  // Spotify întoarce 403 pentru cel puțin trei lucruri diferite, iar noi le puneam pe toate în
  // aceeași propoziție — de-aia „fă-mi un playlist" răspundea „n-ai Premium" unui cont care ÎL
  // ARE, și nu aveai cum să afli motivul adevărat. Playlisturile n-au nicio legătură cu
  // Premium. Acolo 403 înseamnă aproape întotdeauna scope lipsă, iar scope-urile se fixează în
  // clipa autorizării: adăugarea unuia nou în listă nu schimbă nimic până nu refaci autorizarea.
  //
  // Deci citim motivul din corpul răspunsului și îl spunem ca atare.
  if (res.status === 403) {
    const corp = await res.text().catch(() => '');
    let detaliu = {};
    try {
      detaliu = JSON.parse(corp)?.error || {};
    } catch {
      /* uneori corpul e text simplu, nu JSON */
    }
    const motiv = String(detaliu.reason || '');
    const mesaj = String(detaliu.message || corp || '');
    // Antetele separa cele doua lumi: un refuz venit de la APLICATIA Spotify are corp JSON si
    // `content-type: application/json`; unul venit de la un strat de margine (proxy, protectie
    // anti-bot) are corp text si alt `server`. Fara ele, „Forbidden" nu spune de la cine vine.
    console.error(
      "SPOTIFY_403",
      cale,
      motiv,
      mesaj.slice(0, 200),
      JSON.stringify({
        server: res.headers.get("server"),
        ctype: res.headers.get("content-type"),
        wwwAuth: res.headers.get("www-authenticate"),
      })
    );

    if (/scope/i.test(mesaj)) {
      // Înainte să dăm vina pe autorizare: poate fi doar un token de acces VECHI, prins în
      // cache-ul unui izolat rămas cald de dinainte de reautorizare. Scope-urile se fixează la
      // autorizare, dar un access token deja emis le păstrează pe cele vechi până expiră — până
      // la o oră în care „am reautorizat și tot nu merge" ar părea adevărat.
      //
      // Aruncăm cache-ul și mai încercăm o dată, o singură dată. Dacă tot 403 e, chiar lipsește.
      if (!optiuni.__reincercatScope) {
        tokenCache = null;
        profilCache = null;
        return api(env, agent, cale, { ...optiuni, __reincercatScope: true });
      }

      const err = new Error(
        'Spotify a refuzat: autorizarea de acum nu acoperă operația asta (scope lipsă). Trebuie ' +
          'refăcută o singură dată autorizarea, din browser — ruta /spotify/auth. Nu are ' +
          'legătură cu Premium.'
      );
      err.code = 'SPOTIFY_SCOPE_MISSING';
      throw err;
    }

    // Scrierea e închisă pentru aplicațiile personale — nu e o eroare de-a noastră.
    //
    // Din 15 mai 2025, singurul mod în care Spotify permite scrierea („Extended Quota") cere
    // firmă înregistrată și 250.000 de utilizatori lunari. O aplicație în „Development mode",
    // cum e asta, primește 403 pe TOT ce scrie — creare de playlist, adăugare de piese — chiar
    // și în contul propriu al dezvoltatorului, chiar și Premium. Cititul merge mai departe.
    //
    // Se recunoaște după un „Forbidden" sec, fără `reason`, pe o metodă care nu e GET.
    // Nu are rost nicio reîncercare, și nici nu trebuie confundat cu Premium sau cu scope.
    if ((optiuni.method || 'GET') !== 'GET') {
      const err = new Error(
        'Spotify nu mai lasă aplicațiile personale să scrie (creare de playlist, adăugare de ' +
          'piese). E o limită a platformei din 15 mai 2025, nu ceva ce se poate rezolva din cod ' +
          'sau din setări, și nu are legătură nici cu Premium, nici cu permisiunile. Căutarea ' +
          'merge mai departe. NU reîncerca: dă-i omului piesele găsite, cu linkuri, ca să le ' +
          'adauge el în Spotify.'
      );
      err.code = 'SPOTIFY_WRITE_BLOCKED';
      throw err;
    }

    if (motiv === 'PREMIUM_REQUIRED' || /premium/i.test(mesaj)) {
      const err = new Error(
        'Comanda asta cere Spotify Premium — controlul redării (pornit, pauză, volum) nu merge ' +
          'pe cont gratuit. Căutarea și playlisturile merg oricum.'
      );
      err.code = 'SPOTIFY_PREMIUM_REQUIRED';
      throw err;
    }

    const err = new Error(
      `Spotify a refuzat comanda${mesaj ? `: ${mesaj}` : '.'}${motiv ? ` (${motiv})` : ''}`
    );
    err.code = 'SPOTIFY_FORBIDDEN';
    throw err;
  }

  // 404 pe `/me/player` NU înseamnă „ruta nu există", ci „niciun dispozitiv activ". Comentariul
  // ăsta exista deja mai sus, dar codul nu-l respecta: eroarea ieșea ca „Spotify a răspuns 404",
  // iar modelul, pus să explice ceva ce nu i s-a spus, a inventat „nu găsesc piesa" — trimițând
  // omul să caute vina în numele melodiei, adică exact în locul greșit.
  if (res.status === 404 && cale.startsWith('/me/player')) {
    const err = new Error(
      'Spotify nu are niciun dispozitiv activ. Piesa a fost găsită — lipsește doar unde să o ' +
        'cânte. Deschide Spotify pe telefon (spotify_deschide_pe_telefon) și încearcă din nou.'
    );
    err.code = 'SPOTIFY_NO_DEVICE';
    throw err;
  }

  if (!res.ok) {
    const detaliu = await res.text().catch(() => '');
    console.error('SPOTIFY_API_ERROR', res.status, cale, detaliu.slice(0, 300));
    const err = new Error(`Spotify a răspuns ${res.status}.`);
    err.code = 'SPOTIFY_REQUEST_FAILED';
    throw err;
  }

  return res.json().catch(() => null);
}

// Cine e utilizatorul: id-ul (pentru creat playlisturi), țara (pentru căutare) și dacă e
// Premium (ca să putem spune din timp că redarea nu va merge).
async function profil(env, agent) {
  if (profilCache) return profilCache;
  const eu = await api(env, agent, '/me');
  profilCache = {
    id: eu.id,
    tara: eu.country || 'RO',
    premium: eu.product === 'premium',
    nume: eu.display_name || eu.id,
  };
  // Logat o data per izolat: cand ceva e refuzat, prima intrebare e „in ce cont lucram?".
  // `product` lipsa inseamna ca scope-ul `user-read-private` n-a fost acordat la autorizare.
  console.log(
    'SPOTIFY_ME',
    profilCache.id,
    eu.product || '(fara product)',
    eu.country || '(fara country)'
  );
  return profilCache;
}

function descrieMelodie(item) {
  if (!item) return null;
  return {
    melodie: item.name,
    artist: (item.artists || []).map((a) => a.name).join(', '),
    album: item.album?.name,
    uri: item.uri,
  };
}

// ─── Unelte ────────────────────────────────────────────────────────────────────────────────

export const SPOTIFY_CE_CANTA_TOOL = {
  name: 'spotify_ce_canta',
  description:
    'Spune ce se aude acum pe Spotify: melodia, artistul, albumul și pe ce dispozitiv. ' +
    'Folosește-o la „ce cântă?", „cum se numește melodia asta?", „ce ascult?".',
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

export async function spotifyCeCanta(env, input, agent) {
  // „Niciun dispozitiv activ" e un raspuns valid la „ce canta?", nu o eroare: nu canta nimic.
  const stare = await api(env, agent, "/me/player").catch((err) => {
    if (err.code === "SPOTIFY_NO_DEVICE") return null;
    throw err;
  });
  if (!stare || !stare.item) {
    return { canta: false, nota: "Nu se aude nimic pe Spotify acum." };
  }
  return {
    canta: !!stare.is_playing,
    ...descrieMelodie(stare.item),
    dispozitiv: stare.device?.name,
  };
}

export const SPOTIFY_REDA_TOOL = {
  name: 'spotify_reda',
  description:
    'Pornește ceva pe Spotify: o melodie, un artist, un album sau un playlist, căutat după ' +
    'nume. Fără „cautare", reia ce era pus pe pauză. Cere Spotify Premium și un dispozitiv ' +
    'activ — dacă Spotify e închis pe telefon, cheamă întâi spotify_deschide_pe_telefon.',
  input_schema: {
    type: 'object',
    properties: {
      cautare: {
        type: 'string',
        description:
          'Ce să caute, în cuvintele utilizatorului: „Bohemian Rhapsody", „Ludovico Einaudi", ' +
          'numele unui playlist de-al lui. Lasă gol ca să reia ce era oprit.',
      },
      tip: {
        type: 'string',
        enum: ['melodie', 'artist', 'album', 'playlist'],
        description: 'Ce fel de lucru se caută. Implicit „melodie".',
      },
    },
    required: [],
    additionalProperties: false,
  },
};

/**
 * Telefonul, din lista de dispozitive Spotify Connect — sau nimic.
 *
 * REGULA, plătită o dată: **niciodată „primul din listă"**. Contul are și boxe (Alexa, în casă).
 * O rezervă de forma „dacă nu găsesc telefonul, pornesc pe orice" înseamnă muzică pornită din
 * senin într-o altă cameră, poate la ora la care doarme cineva. Un asistent care nu găsește
 * telefonul trebuie să spună asta, nu să aleagă singur altă cameră.
 */
async function telefonulDintreDispozitive(env, agent) {
  const lista = (await api(env, agent, '/me/player/devices').catch(() => null))?.devices || [];
  return lista.find((d) => d.type === 'Smartphone') || null;
}

/**
 * Pornește redarea — iar dacă Spotify spune „niciun dispozitiv activ", o pornește EXPLICIT pe
 * telefon, în loc să dea vina înapoi pe om.
 *
 * De ce e nevoie: „activ" nu înseamnă „aplicația e deschisă". Spotify Connect marchează un
 * telefon ca activ abia după ce a cântat ceva măcar o dată. Imediat după deschiderea aplicației,
 * telefonul APARE în lista de dispozitive, dar niciunul nu e activ — iar o comandă de redare
 * fără destinatar cade cu 404. `device_id` în adresă e chiar mecanismul prin care Spotify
 * pornește pe un dispozitiv inactiv.
 *
 * Dacă telefonul nu e nici măcar în listă, îl deschidem noi și mai așteptăm o dată: aplicația
 * are nevoie de câteva secunde ca să se anunțe la Spotify Connect.
 */
async function pornesteRedarea(env, agent, corp) {
  try {
    await api(env, agent, '/me/player/play', { method: 'PUT', body: corp });
    return null; // a pornit pe dispozitivul activ, oricare era
  } catch (err) {
    if (err.code !== 'SPOTIFY_NO_DEVICE') throw err;

    let telefon = await telefonulDintreDispozitive(env, agent);

    if (!telefon && agent) {
      // Spotify nu e deschis pe telefon. Îl deschidem, apoi îi dăm răgaz să se anunțe.
      await spotifyDeschide(env, {}, agent).catch(() => {});
      await new Promise((gata) => setTimeout(gata, 2500));
      telefon = await telefonulDintreDispozitive(env, agent);
    }

    // Tot nimic: mesajul original e corect și cinstit. NU alegem altă boxă.
    if (!telefon) throw err;

    await api(env, agent, `/me/player/play?device_id=${encodeURIComponent(telefon.id)}`, {
      method: 'PUT',
      body: corp,
    });
    return telefon.name;
  }
}

export async function spotifyReda(env, input, agent) {
  const cautare = (input.cautare || '').trim();

  if (!cautare) {
    const unde = await pornesteRedarea(env, agent, undefined);
    return { ok: true, actiune: 'am reluat redarea', dispozitiv: unde || undefined };
  }

  const tipuri = { melodie: 'track', artist: 'artist', album: 'album', playlist: 'playlist' };
  const tip = tipuri[input.tip || 'melodie'] || 'track';
  const { tara } = await profil(env, agent);

  const cautat = await api(
    env,
    agent,
    `/search?q=${encodeURIComponent(cautare)}&type=${tip}&limit=1&market=${tara}`
  );
  const gasit = cautat?.[`${tip}s`]?.items?.[0];
  if (!gasit) {
    const err = new Error(`Nu am găsit „${cautare}" pe Spotify.`);
    err.code = 'SPOTIFY_NOT_FOUND';
    throw err;
  }

  // O melodie se pornește prin `uris`; un artist, album sau playlist prin `context_uri` —
  // altfel Spotify răspunde 400 fără să spună de ce.
  const corp = tip === 'track' ? { uris: [gasit.uri] } : { context_uri: gasit.uri };
  const unde = await pornesteRedarea(env, agent, corp);

  return {
    ok: true,
    pornit: gasit.name,
    artist: (gasit.artists || []).map((a) => a.name).join(', ') || undefined,
    tip: input.tip || 'melodie',
    dispozitiv: unde || undefined,
  };
}

export const SPOTIFY_CONTROLEAZA_TOOL = {
  name: 'spotify_controleaza',
  description:
    'Comenzi scurte pentru ce cântă acum: pauză, reluare, melodia următoare sau precedentă, ' +
    'volum. Cere Spotify Premium.',
  input_schema: {
    type: 'object',
    properties: {
      actiune: {
        type: 'string',
        enum: ['pauza', 'reia', 'urmatoarea', 'precedenta', 'volum'],
        description: 'Ce să facă.',
      },
      volum: {
        type: 'number',
        description: 'Doar pentru actiune "volum": 0-100.',
      },
    },
    required: ['actiune'],
    additionalProperties: false,
  },
};

export async function spotifyControleaza(env, input, agent) {
  switch (input.actiune) {
    case 'pauza':
      await api(env, agent, '/me/player/pause', { method: 'PUT' });
      return { ok: true, actiune: 'pauză' };
    case 'reia':
      await api(env, agent, '/me/player/play', { method: 'PUT' });
      return { ok: true, actiune: 'am reluat' };
    case 'urmatoarea':
      await api(env, agent, '/me/player/next', { method: 'POST' });
      return { ok: true, actiune: 'următoarea' };
    case 'precedenta':
      await api(env, agent, '/me/player/previous', { method: 'POST' });
      return { ok: true, actiune: 'precedenta' };
    case 'volum': {
      const nivel = Math.min(100, Math.max(0, Math.round(Number(input.volum))));
      if (!Number.isFinite(nivel)) {
        const err = new Error('Spune un volum între 0 și 100.');
        err.code = 'SPOTIFY_BAD_VOLUME';
        throw err;
      }
      await api(env, agent, `/me/player/volume?volume_percent=${nivel}`, { method: 'PUT' });
      return { ok: true, volum: nivel };
    }
    default: {
      const err = new Error(`Acțiune necunoscută: ${input.actiune}`);
      err.code = 'SPOTIFY_BAD_ACTION';
      throw err;
    }
  }
}

export const SPOTIFY_CREEAZA_PLAYLIST_TOOL = {
  name: 'spotify_creeaza_playlist',
  description:
    'Alege piesele pentru un playlist. TU alegi ce intră: dai o listă de căutări (artiști, ' +
    'melodii, genuri, ambianțe), iar unealta caută fiecare și adună rezultatele. Folosește-o ' +
    'la „fă-mi un playlist pentru...", „pune-mi ceva de alergat", „vreau muzică de lucru". ' +
    'ATENȚIE: Spotify nu mai lasă aplicațiile personale să creeze efectiv playlisturi. Când ' +
    'răspunsul vine cu creat: false, piesele SUNT găsite — citește-i-le omului cu linkuri, ' +
    'fără să te scuzi pentru o limită care nu e a lui.',
  input_schema: {
    type: 'object',
    properties: {
      nume: {
        type: 'string',
        description: 'Numele playlistului, scurt și omenesc, în română — ex. „Seară liniștită".',
      },
      descriere: {
        type: 'string',
        description: 'O propoziție despre ce e playlistul. Apare în Spotify sub nume.',
      },
      cautari: {
        type: 'array',
        items: { type: 'string' },
        description:
          'ÎNTRE 8 ȘI 20 de căutări, una pe rând, care traduc starea cerută în muzică reală. ' +
          'Fii CONCRET: nume de artiști și de melodii potrivite stării, nu cuvinte vagi. ' +
          'Pentru „ceva melancolic de toamnă": „Bon Iver Holocene", „Agnes Obel Riverside", ' +
          '„Nils Frahm", „Sufjan Stevens Mystery of Love"… Amestecă artiști cunoscuți cu ' +
          'unii mai puțin cunoscuți, ca playlistul să nu fie previzibil.',
      },
      numar_melodii: {
        type: 'number',
        description: 'Câte melodii să aibă în total. Implicit 25.',
      },
    },
    required: ['nume', 'descriere', 'cautari'],
    additionalProperties: false,
  },
};

export async function spotifyCreeazaPlaylist(env, input, agent) {
  const cautari = (input.cautari || []).map((c) => String(c).trim()).filter(Boolean);
  if (cautari.length === 0) {
    const err = new Error('Am nevoie de câteva căutări ca să am ce pune în playlist.');
    err.code = 'SPOTIFY_NO_SEEDS';
    throw err;
  }

  const { id: userId, tara } = await profil(env, agent);
  const dorite = Math.min(Math.max(Number(input.numar_melodii) || 25, 5), 60);

  // Câte melodii luăm din fiecare căutare, ca să iasă aproximativ cât s-a cerut. Minimum 2:
  // cu una singură, un artist căutat ar aduce doar piesa lui cea mai cunoscută.
  const dinFiecare = Math.max(2, Math.ceil(dorite / cautari.length));

  const piese = [];
  const vazute = new Set();

  // În paralel: 20 de căutări una după alta ar însemna zeci de secunde, iar în voce omul
  // așteaptă cu telefonul la ureche.
  const rezultate = await Promise.all(
    cautari.map((q) =>
      api(env, agent, `/search?q=${encodeURIComponent(q)}&type=track&limit=${dinFiecare}&market=${tara}`)
        .catch(() => null)
    )
  );

  for (const rezultat of rezultate) {
    for (const piesa of rezultat?.tracks?.items || []) {
      if (!piesa?.uri || vazute.has(piesa.uri)) continue;
      vazute.add(piesa.uri);
      piese.push({ ...descrieMelodie(piesa), link: piesa.external_urls?.spotify });
    }
  }

  if (piese.length === 0) {
    const err = new Error('Nu am găsit nicio melodie pentru căutările astea.');
    err.code = 'SPOTIFY_NOTHING_FOUND';
    throw err;
  }

  // Amestecate: altfel playlistul ar fi grupat pe căutări — toate piesele unui artist la rând,
  // ceea ce se aude ca o listă de căutări, nu ca un playlist.
  for (let i = piese.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [piese[i], piese[j]] = [piese[j], piese[i]];
  }
  const alese = piese.slice(0, dorite);

  // Partea grea — alegerea pieselor — s-a făcut deja, și e făcută de model, nu de Spotify.
  // Dacă platforma refuză SCRIEREA (vezi `api()`: aplicațiile personale n-au voie din 15 mai
  // 2025), n-are niciun rost să pierdem și restul: întoarcem lista, ca omul să o aibă imediat
  // în față și să o adauge singur. O căutare reușită care se termină cu „n-am putut" ar fi
  // exact munca degeaba.
  let playlist;
  try {
    playlist = await api(env, agent, `/users/${encodeURIComponent(userId)}/playlists`, {
      method: 'POST',
      body: {
        name: input.nume,
        description: input.descriere || '',
        // Privat implicit: e playlistul lui, nu o publicare.
        public: false,
      },
    });

    // Maximum 100 de uri-uri pe cerere (aici sunt oricum mai puține, dar plafonul e al lor).
    await api(env, agent, `/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      body: { uris: alese.map((p) => p.uri).slice(0, 100) },
    });
  } catch (err) {
    if (err.code !== 'SPOTIFY_WRITE_BLOCKED') throw err;
    return {
      ok: false,
      creat: false,
      motiv:
        'Spotify nu lasă aplicațiile personale să creeze playlisturi (limită a platformei, nu ' +
        'a contului). Piesele sunt găsite — spune-i-le, cu linkuri, ca să le adauge el.',
      nume: input.nume,
      piese: alese,
    };
  }

  return {
    ok: true,
    creat: true,
    nume: input.nume,
    melodii: alese.length,
    link: playlist.external_urls?.spotify,
    uri: playlist.uri,
  };
}

export const SPOTIFY_DESCHIDE_TOOL = {
  name: 'spotify_deschide_pe_telefon',
  description:
    'Deschide aplicația Spotify pe telefonul utilizatorului. Folosește-o când vrea să asculte ' +
    'ceva dar Spotify nu e pornit, sau când spotify_reda spune că nu găsește niciun dispozitiv ' +
    'activ — Spotify trebuie să fie deschis undeva ca să poată primi comenzi.',
  input_schema: {
    type: 'object',
    properties: {
      uri: {
        type: 'string',
        description:
          'Opțional: ce anume să deschidă (ex. uri-ul unui playlist tocmai creat, ' +
          '„spotify:playlist:..."). Fără el, deschide doar aplicația.',
      },
    },
    required: [],
    additionalProperties: false,
  },
};

export async function spotifyDeschide(env, input, agent) {
  if (!agent) {
    const err = new Error('Unealta are nevoie de agent');
    err.code = 'AGENT_REQUIRED';
    throw err;
  }

  const rezultat = await agent.trimiteComandaLaTelefon({
    tip: 'deschide',
    pachet: 'com.spotify.music',
    uri: (input.uri || '').trim(),
    eticheta: 'Spotify',
  });

  if (!rezultat.ok) {
    const err = new Error(rezultat.motiv || 'Nu am putut deschide Spotify pe telefon.');
    err.code = 'SPOTIFY_OPEN_FAILED';
    throw err;
  }
  return { ok: true, deschis: 'Spotify' };
}
