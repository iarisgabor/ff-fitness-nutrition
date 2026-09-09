function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// Offsetul (în minute) al fusului `timeZone` la instanța `date` — calculat prin formatarea
// instanței în acel fus și interpretarea rezultatului CA ȘI CUM ar fi UTC; diferența dintre
// cele două e offsetul. Merge corect și peste schimbarea orei de vară/iarnă, fără librării.
function timeZoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24, // Intl poate da "24" la miezul nopții cu hour12:false
    get('minute'),
    get('second')
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

function candidateAt(referenceInstant, timeZone, hour, minute) {
  const { year, month, day } = localDateParts(referenceInstant, timeZone);
  const offsetMinutes = timeZoneOffsetMinutes(referenceInstant, timeZone);
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60000;
  return new Date(utcMillis);
}

// Următoarea instanță (UTC) la care e ora `hour:minute` locală în `timeZone`, strict după `from`.
export function nextDailyRunAt(timeZone, hour, minute, from = new Date()) {
  const todayCandidate = candidateAt(from, timeZone, hour, minute);
  if (todayCandidate.getTime() > from.getTime()) return todayCandidate;
  const roughlyTomorrow = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return candidateAt(roughlyTomorrow, timeZone, hour, minute);
}

// Data (YYYY-MM-DD) în `timeZone`, la `dayOffset` zile față de `date`.
export function isoDateInTimeZone(date, timeZone, dayOffset = 0) {
  const shifted = new Date(date.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const { year, month, day } = localDateParts(shifted, timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Instanța UTC corespunzătoare unei date+ore locale, în `timeZone` (ex. limitele unei zile
// calendaristice pentru un query Calendar events.list, care cere timeMin/timeMax cu offset).
export function localDateTimeToUtc(isoDate, timeStr, timeZone) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hour, minute, second] = timeStr.split(':').map(Number);
  const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
  const offsetMinutes = timeZoneOffsetMinutes(approx, timeZone);
  return new Date(approx.getTime() - offsetMinutes * 60000);
}
