const SERVICES_BASE = 'https://api.planningcenteronline.com/services/v2';
const PEOPLE_BASE = 'https://api.planningcenteronline.com/people/v2';

// Persoana din spatele acestui bot — există un al doilea "Iaris Gabor" duplicat în Planning
// Center, cu alt ID; person_id-ul de mai jos e cel real, confirmat manual (vezi prompt.js).
// Folosit de sign_up_for_position ca să nu fie nevoie de căutare/dezambiguizare la fiecare înscriere.
const SELF_PERSON_ID = '49625294';

// Planning Center folosește Basic Auth cu Personal Access Token (App ID + Secret), nu OAuth —
// spre deosebire de Google Calendar, nu există schimb de token/expirare, deci nu e nevoie de cache.
function authHeader(env) {
  const appId = (env.PLANNING_CENTER_APP_ID || '').trim();
  const secret = (env.PLANNING_CENTER_SECRET || '').trim();
  if (!appId || !secret) {
    const err = new Error('Lipsesc credențialele Planning Center (PLANNING_CENTER_APP_ID / PLANNING_CENTER_SECRET)');
    err.code = 'PLANNING_CENTER_AUTH_MISSING';
    throw err;
  }
  return 'Basic ' + btoa(`${appId}:${secret}`);
}

async function pcoFetch(env, baseUrl, path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: authHeader(env),
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    console.error('PLANNING_CENTER_REQUEST_FAILED', res.status, path, detail);
    const err = new Error(`Planning Center request failed (${res.status}): ${detail}`);
    err.code = res.status === 401 || res.status === 403 ? 'PLANNING_CENTER_AUTH_FAILED' : 'PLANNING_CENTER_REQUEST_FAILED';
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const LIST_SERVICE_TYPES_TOOL = {
  name: 'list_service_types',
  description:
    'Listează tipurile de serviciu din Planning Center Services (ex. "Duminică dimineața", "Tineret"). ' +
    'Folosește-o ÎNTOTDEAUNA înainte de find_service_plans, ca să afli service_type_id-ul corect — ' +
    'nu inventa niciodată un id.',
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

export async function listServiceTypes(env) {
  const data = await pcoFetch(env, SERVICES_BASE, '/service_types?per_page=100');
  return {
    service_types: (data.data || []).map((item) => ({
      id: item.id,
      name: item.attributes?.name || '(fără nume)',
    })),
  };
}

export const FIND_SERVICE_PLANS_TOOL = {
  name: 'find_service_plans',
  description:
    'Caută planurile de serviciu (duminici/evenimente programate) dintr-un tip de serviciu, într-un ' +
    'interval de date. Folosește service_type_id obținut din list_service_types — nu inventa niciodată ' +
    'un id. Returnează, pentru fiecare plan, id, titlu și data.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu, din list_service_types' },
      date_from: { type: 'string', description: 'Prima zi a intervalului de căutare, YYYY-MM-DD' },
      date_to: { type: 'string', description: 'Ultima zi a intervalului (inclusiv), YYYY-MM-DD' },
    },
    required: ['service_type_id', 'date_from', 'date_to'],
    additionalProperties: false,
  },
};

function matchPlansInRange(data, from, to) {
  return (data.data || [])
    .filter((item) => {
      const sortDate = item.attributes?.sort_date;
      if (!sortDate) return false;
      const day = sortDate.slice(0, 10);
      return day >= from && day <= to;
    })
    .map((item) => ({
      id: item.id,
      title: item.attributes?.title || item.attributes?.series_title || '(fără titlu)',
      dates: item.attributes?.dates || item.attributes?.sort_date,
    }));
}

// PCO nu acceptă "future,past" combinate ca valoare pentru `filter` (rezultat gol, silențios,
// fără eroare) — încercăm întâi "future" (cazul comun: căutare pentru o dată viitoare), apoi
// cădem pe "past" doar dacă primul nu găsește nimic, ca să acoperim și datele din trecut.
// IMPORTANT: "future" trebuie ordonat crescător (cel mai apropiat viitor primul), dar "past"
// trebuie ordonat DESCRESCĂTOR (cel mai recent trecut primul) — altfel, cu per_page=100, primele
// rezultate din "past" ar fi cele mai VECHI planuri din tot istoricul contului, nu cele recente.
export async function findServicePlans(env, input) {
  const basePath = `/service_types/${encodeURIComponent(input.service_type_id)}/plans?per_page=100`;

  const futureData = await pcoFetch(env, SERVICES_BASE, `${basePath}&order=sort_date&filter=future`);
  const futurePlans = matchPlansInRange(futureData, input.date_from, input.date_to);
  if (futurePlans.length > 0) return { plans: futurePlans };

  const pastData = await pcoFetch(env, SERVICES_BASE, `${basePath}&order=-sort_date&filter=past`);
  const pastPlans = matchPlansInRange(pastData, input.date_from, input.date_to);
  return { plans: pastPlans };
}

export const GET_PLAN_SCHEDULE_TOOL = {
  name: 'get_plan_schedule',
  description:
    'Citește cine e programat (echipa/schedule) pentru un plan de serviciu — nume, poziție/rol, echipă ' +
    'și status (confirmat/neconfirmat/refuzat). Folosește plan_id obținut din find_service_plans — nu ' +
    'inventa niciodată un id. Folosește team_member_id din rezultat pentru update_team_member_status.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu' },
      plan_id: { type: 'string', description: 'ID-ul planului, din find_service_plans' },
    },
    required: ['service_type_id', 'plan_id'],
    additionalProperties: false,
  },
};

const STATUS_LABELS = { C: 'confirmat', U: 'neconfirmat', D: 'refuzat' };

export async function getPlanSchedule(env, input) {
  const data = await pcoFetch(
    env,
    SERVICES_BASE,
    `/service_types/${encodeURIComponent(input.service_type_id)}/plans/${encodeURIComponent(input.plan_id)}/team_members?per_page=100`
  );

  return {
    team_members: (data.data || []).map((item) => ({
      team_member_id: item.id,
      person_id: item.relationships?.person?.data?.id || '',
      name: item.attributes?.name || '(fără nume)',
      team_position: item.attributes?.team_position_name || '',
      status: STATUS_LABELS[item.attributes?.status] || item.attributes?.status || '',
    })),
  };
}

export const GET_PLAN_ITEMS_TOOL = {
  name: 'get_plan_items',
  description:
    'Citește ordinea de serviciu (cântări și celelalte elemente) pentru un plan. Folosește plan_id ' +
    'obținut din find_service_plans — nu inventa niciodată un id.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu' },
      plan_id: { type: 'string', description: 'ID-ul planului, din find_service_plans' },
    },
    required: ['service_type_id', 'plan_id'],
    additionalProperties: false,
  },
};

export async function getPlanItems(env, input) {
  const data = await pcoFetch(
    env,
    SERVICES_BASE,
    `/service_types/${encodeURIComponent(input.service_type_id)}/plans/${encodeURIComponent(input.plan_id)}/items?per_page=200&include=song`
  );

  // DEBUG temporar — verificăm dacă resursa Song are vreun câmp de statistici de utilizare deja
  // calculat de PCO, care ne-ar scuti de agregarea manuală pe planuri din get_top_songs.
  console.log('SONG_RAW_ATTRS', JSON.stringify((data.included || []).filter((inc) => inc.type === 'Song')));

  const songsById = new Map(
    (data.included || [])
      .filter((inc) => inc.type === 'Song')
      .map((inc) => [inc.id, inc.attributes?.title || ''])
  );

  const items = (data.data || [])
    .sort((a, b) => (a.attributes?.sequence ?? 0) - (b.attributes?.sequence ?? 0))
    .map((item) => {
      const songId = item.relationships?.song?.data?.id;
      return {
        title: item.attributes?.title || '',
        type: item.attributes?.item_type || 'item',
        song_title: songId ? songsById.get(songId) || '' : '',
      };
    });

  return { items };
}

export const SEARCH_PEOPLE_TOOL = {
  name: 'search_people',
  description:
    'Caută o persoană din organizația Planning Center după nume. Folosește-o când utilizatorul ' +
    'menționează un nume de persoană și ai nevoie de identitatea ei exactă (ex. înainte de a verifica ' +
    'programul cuiva).',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Numele (parțial sau complet) al persoanei căutate' },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

export async function searchPeople(env, input) {
  const data = await pcoFetch(
    env,
    PEOPLE_BASE,
    `/people?where[search_name]=${encodeURIComponent(input.query)}&per_page=25`
  );

  return {
    people: (data.data || []).map((item) => ({
      id: item.id,
      name: `${item.attributes?.first_name || ''} ${item.attributes?.last_name || ''}`.trim(),
    })),
  };
}

export const UPDATE_TEAM_MEMBER_STATUS_TOOL = {
  name: 'update_team_member_status',
  description:
    'Confirmă sau refuză o programare (team member) dintr-un plan de serviciu, identificată prin ' +
    'team_member_id (obținut din get_plan_schedule — nu inventa niciodată un id). Modifică programul ' +
    'întregii echipe, deci folosește-o DOAR după ce utilizatorul a confirmat clar, în acest schimb de ' +
    'mesaje, ce persoană/poziție și ce status nou vrea.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu' },
      plan_id: { type: 'string', description: 'ID-ul planului' },
      team_member_id: { type: 'string', description: 'ID-ul programării, din get_plan_schedule' },
      status: {
        type: 'string',
        enum: ['confirmed', 'declined'],
        description: '"confirmed" pentru a confirma programarea, "declined" pentru a o refuza',
      },
    },
    required: ['service_type_id', 'plan_id', 'team_member_id', 'status'],
    additionalProperties: false,
  },
};

const STATUS_CODES = { confirmed: 'C', declined: 'D' };

export async function updateTeamMemberStatus(env, input) {
  const data = await pcoFetch(
    env,
    SERVICES_BASE,
    `/service_types/${encodeURIComponent(input.service_type_id)}/plans/${encodeURIComponent(input.plan_id)}/team_members/${encodeURIComponent(input.team_member_id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'TeamMember',
          id: input.team_member_id,
          attributes: { status: STATUS_CODES[input.status] },
        },
      }),
    }
  );

  return {
    ok: true,
    name: data.data?.attributes?.name || '',
    status: STATUS_LABELS[data.data?.attributes?.status] || data.data?.attributes?.status || '',
  };
}

export const LIST_TEAMS_TOOL = {
  name: 'list_teams',
  description:
    'Listează echipele (ex. "Vocal", "Instrumente") dintr-un tip de serviciu. Folosește-o ÎNTOTDEAUNA ' +
    'înainte de list_team_positions, ca să afli team_id-ul corect — nu inventa niciodată un id.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu, din list_service_types' },
    },
    required: ['service_type_id'],
    additionalProperties: false,
  },
};

export async function listTeams(env, input) {
  const data = await pcoFetch(
    env,
    SERVICES_BASE,
    `/service_types/${encodeURIComponent(input.service_type_id)}/teams?per_page=100`
  );
  return {
    teams: (data.data || []).map((item) => ({
      id: item.id,
      name: item.attributes?.name || '(fără nume)',
    })),
  };
}

export const LIST_TEAM_POSITIONS_TOOL = {
  name: 'list_team_positions',
  description:
    'Listează pozițiile/rolurile (ex. "Chitară bas", "Vocal principal") dintr-o echipă. Folosește ' +
    'team_id obținut din list_teams — nu inventa niciodată un id. Folosește team_position_id din ' +
    'rezultat pentru sign_up_for_position.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu' },
      team_id: { type: 'string', description: 'ID-ul echipei, din list_teams' },
    },
    required: ['service_type_id', 'team_id'],
    additionalProperties: false,
  },
};

export async function listTeamPositions(env, input) {
  const data = await pcoFetch(
    env,
    SERVICES_BASE,
    `/service_types/${encodeURIComponent(input.service_type_id)}/teams/${encodeURIComponent(input.team_id)}/team_positions?per_page=100`
  );
  return {
    team_positions: (data.data || []).map((item) => ({
      id: item.id,
      name: item.attributes?.name || '(fără nume)',
    })),
  };
}

export const SIGN_UP_FOR_POSITION_TOOL = {
  name: 'sign_up_for_position',
  description:
    'Înscrie utilizatorul (persoana din spatele acestui bot) pe o poziție dintr-un plan de serviciu — ' +
    'ex. "vreau să mă înscriu la chitară bas pe 13 septembrie". Folosește plan_id (din ' +
    'find_service_plans), team_id (din list_teams) și team_position_name (numele EXACT din ' +
    'list_team_positions, ex. "Chitară bas") — nu inventa niciodată un id sau un nume. Creează o ' +
    'programare nouă, confirmată direct, pentru utilizator pe poziția respectivă.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu' },
      plan_id: { type: 'string', description: 'ID-ul planului, din find_service_plans' },
      team_id: { type: 'string', description: 'ID-ul echipei, din list_teams' },
      team_position_name: {
        type: 'string',
        description: 'Numele EXACT al poziției, din list_team_positions (câmpul "name")',
      },
    },
    required: ['service_type_id', 'plan_id', 'team_id', 'team_position_name'],
    additionalProperties: false,
  },
};

export async function signUpForPosition(env, input) {
  const data = await pcoFetch(
    env,
    SERVICES_BASE,
    `/service_types/${encodeURIComponent(input.service_type_id)}/plans/${encodeURIComponent(input.plan_id)}/team_members`,
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'TeamMember',
          attributes: { status: 'C', team_position_name: input.team_position_name },
          relationships: {
            person: { data: { type: 'Person', id: SELF_PERSON_ID } },
            team: { data: { type: 'Team', id: input.team_id } },
          },
        },
      }),
    }
  );

  return {
    ok: true,
    team_member_id: data.data?.id || '',
    name: data.data?.attributes?.name || '',
    team_position: data.data?.attributes?.team_position_name || '',
    status: STATUS_LABELS[data.data?.attributes?.status] || data.data?.attributes?.status || '',
  };
}

export const REMOVE_FROM_SCHEDULE_TOOL = {
  name: 'remove_from_schedule',
  description:
    'Șterge definitiv o programare (team member) dintr-un plan de serviciu, identificată prin ' +
    'team_member_id (obținut din get_plan_schedule — nu inventa niciodată un id). Diferit de ' +
    'update_team_member_status("declined"): aici programarea dispare complet, nu doar își schimbă ' +
    'statusul. Folosește-o când utilizatorul vrea să se șteargă de pe o poziție, nu doar să refuze.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu' },
      plan_id: { type: 'string', description: 'ID-ul planului' },
      team_member_id: { type: 'string', description: 'ID-ul programării de șters, din get_plan_schedule' },
    },
    required: ['service_type_id', 'plan_id', 'team_member_id'],
    additionalProperties: false,
  },
};

export async function removeFromSchedule(env, input) {
  await pcoFetch(
    env,
    SERVICES_BASE,
    `/service_types/${encodeURIComponent(input.service_type_id)}/plans/${encodeURIComponent(input.plan_id)}/team_members/${encodeURIComponent(input.team_member_id)}`,
    { method: 'DELETE' }
  );
  return { ok: true };
}

// Spre deosebire de find_service_plans (care se oprește la primul rezultat găsit — future SAU
// past), aici avem nevoie de TOATE planurile din interval pentru agregare statistică pe luni/ani.
// "past" trebuie ordonat descrescător (cel mai recent trecut primul) — la fel ca în
// findServicePlans — altfel primele 100 rezultate ar fi cele mai vechi planuri din cont, nu cele
// din intervalul cerut. Cu per_page=100 acoperim confortabil "ultimul an" (~52 duminici); pentru
// intervale mai mari ar fi nevoie de paginare, neconstruită încă.
async function getAllPlansInRange(env, serviceTypeId, dateFrom, dateTo) {
  const basePath = `/service_types/${encodeURIComponent(serviceTypeId)}/plans?per_page=100`;
  const [futureData, pastData] = await Promise.all([
    pcoFetch(env, SERVICES_BASE, `${basePath}&order=sort_date&filter=future`),
    pcoFetch(env, SERVICES_BASE, `${basePath}&order=-sort_date&filter=past`),
  ]);
  const all = [...(futureData.data || []), ...(pastData.data || [])];
  return all.filter((item) => {
    const sortDate = item.attributes?.sort_date;
    if (!sortDate) return false;
    const day = sortDate.slice(0, 10);
    return day >= dateFrom && day <= dateTo;
  });
}

// Cereri în loturi mici, nu toate deodată — un interval de 6-12 luni înseamnă zeci de planuri,
// deci zeci de cereri către PCO; loturile evită să lovim limita de rate-limit dintr-o dată.
async function mapWithConcurrency(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

export const GET_TOP_SONGS_TOOL = {
  name: 'get_top_songs',
  description:
    'Calculează topul celor mai cântate piese într-un interval de date (ex. "ultimul an", ' +
    '"ultimele 6 luni"), analizând toate planurile din interval. Poate dura câteva secunde pentru ' +
    'intervale mari — e normal, nu repeta apelul. Folosește service_type_id din list_service_types.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu, din list_service_types' },
      date_from: { type: 'string', description: 'Prima zi a intervalului, YYYY-MM-DD' },
      date_to: { type: 'string', description: 'Ultima zi a intervalului (inclusiv), YYYY-MM-DD' },
      limit: { type: 'integer', description: 'Câte piese să returneze; dacă lipsește, implicit 5' },
    },
    required: ['service_type_id', 'date_from', 'date_to'],
    additionalProperties: false,
  },
};

export async function getTopSongs(env, input) {
  const plans = await getAllPlansInRange(env, input.service_type_id, input.date_from, input.date_to);
  const limit = input.limit || 5;

  const itemsByPlan = await mapWithConcurrency(plans, 8, (plan) =>
    getPlanItems(env, { service_type_id: input.service_type_id, plan_id: plan.id }).catch(() => ({ items: [] }))
  );

  const counts = new Map();
  for (const { items } of itemsByPlan) {
    for (const item of items) {
      if (item.type !== 'song' || !item.song_title) continue;
      counts.set(item.song_title, (counts.get(item.song_title) || 0) + 1);
    }
  }

  const top_songs = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([song_title, count]) => ({ song_title, count }));

  return { plans_analyzed: plans.length, top_songs };
}

export const GET_TOP_SCHEDULED_PEOPLE_TOOL = {
  name: 'get_top_scheduled_people',
  description:
    'Calculează topul celor mai des programați oameni într-un interval de date (ex. "ultimul an"), ' +
    'analizând toate planurile din interval (indiferent de status — confirmat, neconfirmat sau ' +
    'refuzat, toate contează ca "programat"). Poate dura câteva secunde pentru intervale mari — e ' +
    'normal, nu repeta apelul. Folosește service_type_id din list_service_types.',
  input_schema: {
    type: 'object',
    properties: {
      service_type_id: { type: 'string', description: 'ID-ul tipului de serviciu, din list_service_types' },
      date_from: { type: 'string', description: 'Prima zi a intervalului, YYYY-MM-DD' },
      date_to: { type: 'string', description: 'Ultima zi a intervalului (inclusiv), YYYY-MM-DD' },
      limit: { type: 'integer', description: 'Câți oameni să returneze; dacă lipsește, implicit 5' },
    },
    required: ['service_type_id', 'date_from', 'date_to'],
    additionalProperties: false,
  },
};

export async function getTopScheduledPeople(env, input) {
  const plans = await getAllPlansInRange(env, input.service_type_id, input.date_from, input.date_to);
  const limit = input.limit || 5;

  const schedulesByPlan = await mapWithConcurrency(plans, 8, (plan) =>
    getPlanSchedule(env, { service_type_id: input.service_type_id, plan_id: plan.id }).catch(() => ({ team_members: [] }))
  );

  const counts = new Map(); // person_id -> { name, count }
  for (const { team_members } of schedulesByPlan) {
    for (const member of team_members) {
      if (!member.person_id) continue;
      const entry = counts.get(member.person_id) || { name: member.name, count: 0 };
      entry.count += 1;
      counts.set(member.person_id, entry);
    }
  }

  const top_people = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return { plans_analyzed: plans.length, top_people };
}
