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

// Aici se adaugă unelte noi (send_email, create_reminder, ...): o intrare în
// TOOL_DEFINITIONS + un handler în EXECUTORS. Restul buclei de tool-use (anthropic.js) și
// agentul (agent.js) nu se modifică.
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
};

export async function executeTool(env, name, input) {
  const executor = EXECUTORS[name];
  if (!executor) {
    const err = new Error(`Unealtă necunoscută: ${name}`);
    err.code = 'UNKNOWN_TOOL';
    throw err;
  }
  const result = await executor(env, input);
  // DEBUG temporar — de scos după ce diagnosticăm de ce "duminica trecută" nu găsește planul.
  console.log('TOOL_CALL', name, JSON.stringify(input), '->', JSON.stringify(result));
  return result;
}
