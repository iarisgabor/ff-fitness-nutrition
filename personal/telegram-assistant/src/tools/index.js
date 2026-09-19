import {
  CREATE_CALENDAR_EVENT_TOOL,
  createCalendarEvent,
  FIND_CALENDAR_EVENTS_TOOL,
  findCalendarEvents,
  UPDATE_CALENDAR_EVENT_TOOL,
  updateCalendarEvent,
  DELETE_CALENDAR_EVENT_TOOL,
  deleteCalendarEvent,
} from './calendar.js';
import {
  LIST_SERVICE_TYPES_TOOL,
  listServiceTypes,
  FIND_SERVICE_PLANS_TOOL,
  findServicePlans,
  GET_PLAN_SCHEDULE_TOOL,
  getPlanSchedule,
  GET_PLAN_ITEMS_TOOL,
  getPlanItems,
  SEARCH_PEOPLE_TOOL,
  searchPeople,
  UPDATE_TEAM_MEMBER_STATUS_TOOL,
  updateTeamMemberStatus,
  LIST_TEAMS_TOOL,
  listTeams,
  LIST_TEAM_POSITIONS_TOOL,
  listTeamPositions,
  SIGN_UP_FOR_POSITION_TOOL,
  signUpForPosition,
  REMOVE_FROM_SCHEDULE_TOOL,
  removeFromSchedule,
  GET_TOP_SONGS_TOOL,
  getTopSongs,
  GET_TOP_SCHEDULED_PEOPLE_TOOL,
  getTopScheduledPeople,
} from './planning-center.js';
import {
  SCHEDULE_CALL_TOOL,
  programeazaApel,
  NOTIFY_NOW_TOOL,
  trimiteNotificare,
} from './notificari.js';
import {
  GET_AIR_CONDITIONER_STATE_TOOL,
  getAirConditionerState,
  CONTROL_AIR_CONDITIONER_TOOL,
  controlAirConditioner,
  SCHEDULE_AIR_CONDITIONER_TOOL,
  scheduleAirConditioner,
  LIST_AIR_CONDITIONER_SCHEDULES_TOOL,
  listAirConditionerSchedules,
  CANCEL_AIR_CONDITIONER_SCHEDULE_TOOL,
  cancelAirConditionerSchedule,
} from './air-conditioner.js';
import { CAUTA_PE_NET_TOOL, cautaPeNet } from './cautare-web.js';
import {
  CITESTE_MESAJE_WHATSAPP_TOOL,
  citesteMesajeWhatsapp,
  TRIMITE_MESAJ_WHATSAPP_TOOL,
  trimiteMesajWhatsapp,
} from './whatsapp.js';
import {
  SPOTIFY_CE_CANTA_TOOL,
  spotifyCeCanta,
  SPOTIFY_REDA_TOOL,
  spotifyReda,
  SPOTIFY_CONTROLEAZA_TOOL,
  spotifyControleaza,
  SPOTIFY_CREEAZA_PLAYLIST_TOOL,
  spotifyCreeazaPlaylist,
  SPOTIFY_DESCHIDE_TOOL,
  spotifyDeschide,
} from './spotify.js';
import { TELEFON_SUNA_TOOL, telefonSuna } from './telefon.js';
import {
  TINE_MINTE_TOOL,
  tineMinte,
  CE_TII_MINTE_TOOL,
  ceTiiMinte,
  UITA_TOOL,
  uita,
} from './memorie.js';
import { CE_AI_FACUT_TOOL, ceAiFacut, REFA_ACTIUNEA_TOOL, refaActiunea } from './jurnal.js';
import {
  CAUTA_EMAILURI_TOOL,
  cautaEmailuri,
  REZUMAT_INBOX_TOOL,
  rezumatInbox,
  CITESTE_EMAIL_TOOL,
  citesteEmail,
  CREEAZA_CIORNA_TOOL,
  creeazaCiorna,
} from './gmail.js';
import {
  ACTIUNI_CU_POARTA,
  amprentaActiunii,
  descrieActiune,
  rezumatPentruJurnal,
  dateDeRefacere,
} from './confirmare.js';

// Uneltele care cară corespondența altor oameni: se loghează NUMELE, niciodată conținutul.
//
// Listă explicită, nu o regulă pe nume: până acum condiția era `name.endsWith('_whatsapp')`, care
// a funcționat doar fiindcă ambele unelte se nimereau să se termine așa. O regulă pe nume încetează
// TĂCUT să protejeze în ziua în care cineva scrie `email_cauta`; o listă se vede că e incompletă.
const UNELTE_CU_CORESPONDENTA = new Set([
  'citeste_mesaje_whatsapp',
  'trimite_mesaj_whatsapp',
  'cauta_emailuri',
  'rezumat_inbox',
  'citeste_email',
  'creeaza_ciorna',
]);

// Aici se adaugă unelte noi (send_email, create_reminder, ...): o intrare în
// TOOL_DEFINITIONS + un handler în EXECUTORS. Restul buclei de tool-use (anthropic.js) și
// agentul (agent.js) nu se modifică — excepție: o unealtă care programează ceva are nevoie și
// de o metodă-callback pe agent (vezi runScheduledAirConditioner).
export const TOOL_DEFINITIONS = [
  CREATE_CALENDAR_EVENT_TOOL,
  FIND_CALENDAR_EVENTS_TOOL,
  UPDATE_CALENDAR_EVENT_TOOL,
  DELETE_CALENDAR_EVENT_TOOL,
  LIST_SERVICE_TYPES_TOOL,
  FIND_SERVICE_PLANS_TOOL,
  GET_PLAN_SCHEDULE_TOOL,
  GET_PLAN_ITEMS_TOOL,
  SEARCH_PEOPLE_TOOL,
  UPDATE_TEAM_MEMBER_STATUS_TOOL,
  LIST_TEAMS_TOOL,
  LIST_TEAM_POSITIONS_TOOL,
  SIGN_UP_FOR_POSITION_TOOL,
  REMOVE_FROM_SCHEDULE_TOOL,
  GET_TOP_SONGS_TOOL,
  GET_TOP_SCHEDULED_PEOPLE_TOOL,
  GET_AIR_CONDITIONER_STATE_TOOL,
  CONTROL_AIR_CONDITIONER_TOOL,
  SCHEDULE_AIR_CONDITIONER_TOOL,
  LIST_AIR_CONDITIONER_SCHEDULES_TOOL,
  CANCEL_AIR_CONDITIONER_SCHEDULE_TOOL,
  SCHEDULE_CALL_TOOL,
  NOTIFY_NOW_TOOL,
  CAUTA_PE_NET_TOOL,
  CITESTE_MESAJE_WHATSAPP_TOOL,
  TRIMITE_MESAJ_WHATSAPP_TOOL,
  SPOTIFY_CE_CANTA_TOOL,
  SPOTIFY_REDA_TOOL,
  SPOTIFY_CONTROLEAZA_TOOL,
  SPOTIFY_CREEAZA_PLAYLIST_TOOL,
  SPOTIFY_DESCHIDE_TOOL,
  TELEFON_SUNA_TOOL,
  TINE_MINTE_TOOL,
  CE_TII_MINTE_TOOL,
  UITA_TOOL,
  CE_AI_FACUT_TOOL,
  REFA_ACTIUNEA_TOOL,
  CAUTA_EMAILURI_TOOL,
  REZUMAT_INBOX_TOOL,
  CITESTE_EMAIL_TOOL,
  CREEAZA_CIORNA_TOOL,
];

const EXECUTORS = {
  create_calendar_event: createCalendarEvent,
  find_calendar_events: findCalendarEvents,
  update_calendar_event: updateCalendarEvent,
  delete_calendar_event: deleteCalendarEvent,
  list_service_types: listServiceTypes,
  find_service_plans: findServicePlans,
  get_plan_schedule: getPlanSchedule,
  get_plan_items: getPlanItems,
  search_people: searchPeople,
  update_team_member_status: updateTeamMemberStatus,
  list_teams: listTeams,
  list_team_positions: listTeamPositions,
  sign_up_for_position: signUpForPosition,
  remove_from_schedule: removeFromSchedule,
  get_top_songs: getTopSongs,
  get_top_scheduled_people: getTopScheduledPeople,
  get_air_conditioner_state: getAirConditionerState,
  control_air_conditioner: controlAirConditioner,
  schedule_air_conditioner: scheduleAirConditioner,
  list_air_conditioner_schedules: listAirConditionerSchedules,
  cancel_air_conditioner_schedule: cancelAirConditionerSchedule,
  programeaza_apel: programeazaApel,
  trimite_notificare: trimiteNotificare,
  cauta_pe_net: cautaPeNet,
  citeste_mesaje_whatsapp: citesteMesajeWhatsapp,
  trimite_mesaj_whatsapp: trimiteMesajWhatsapp,
  spotify_ce_canta: spotifyCeCanta,
  spotify_reda: spotifyReda,
  spotify_controleaza: spotifyControleaza,
  spotify_creeaza_playlist: spotifyCreeazaPlaylist,
  spotify_deschide_pe_telefon: spotifyDeschide,
  suna_pe_telefon: telefonSuna,
  tine_minte: tineMinte,
  ce_tii_minte: ceTiiMinte,
  uita: uita,
  ce_ai_facut: ceAiFacut,
  refa_actiunea: refaActiunea,
  cauta_emailuri: cautaEmailuri,
  rezumat_inbox: rezumatInbox,
  citeste_email: citesteEmail,
  creeaza_ciorna: creeazaCiorna,
};

// `agent` = instanța AssistantAgent — doar uneltele care programează ceva (schedule/listSchedules)
// au nevoie de ea (și aerul condiționat, pentru sesiunea Alexa din SQL); celelalte ignoră al treilea argument.
export async function executeTool(env, name, input, agent) {
  const executor = EXECUTORS[name];
  if (!executor) {
    const err = new Error(`Unealtă necunoscută: ${name}`);
    err.code = 'UNKNOWN_TOOL';
    throw err;
  }

  // Poarta pentru acțiunile ireversibile. Stă AICI, nu în fiecare unealtă, fiindcă `executeTool`
  // e singurul punct prin care trec amândouă căile (agent.js: runToolLoop pentru Telegram și
  // runVoiceTool pentru voce). O poartă scrisă în trei unelte ar trebui scrisă a patra oară de
  // cine adaugă a patra unealtă periculoasă — și n-ar fi.
  //
  // Fără `agent` (n-ar trebui să se întâmple pe niciuna din cele două căi) poarta nu poate ține
  // minte nimic, deci nu poate nici să oprească: lăsăm execuția, ca înainte de poartă.
  if (ACTIUNI_CU_POARTA.has(name) && agent) {
    const verdict = await agent.verificaConfirmarea({
      amprenta: amprentaActiunii(name, input),
      descriere: descrieActiune(name, input),
    });
    if (!verdict.gata) {
      console.log('TOOL_CALL', name, '-> cere confirmare');
      return verdict.raspuns;
    }
  }

  const result = await executor(env, input, agent);

  if (ACTIUNI_CU_POARTA.has(name) && agent) {
    await agent.scrieInJurnal({
      unealta: name,
      rezumat: rezumatPentruJurnal(name, input, result),
      dateRefacere: dateDeRefacere(name, result),
    });
  }

  // DEBUG temporar — de scos după ce diagnosticăm de ce "duminica trecută" nu găsește planul.
  //
  // Uneltele care cară corespondență privată sunt EXCEPTATE de la logarea conținutului: acolo
  // trec mesaje scrise de alți oameni, iar logurile Cloudflare se păstrează și se pot citi de
  // oriunde. Ce ți-a scris tatăl tău n-are ce căuta într-un log de diagnostic. Numele uneltei
  // rămâne — atât e nevoie ca să se vadă că a fost chemată.
  if (UNELTE_CU_CORESPONDENTA.has(name)) {
    console.log('TOOL_CALL', name, '(conținut neînregistrat)');
  } else {
    console.log('TOOL_CALL', name, JSON.stringify(input), '->', JSON.stringify(result));
  }

  return result;
}
