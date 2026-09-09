function formatHM(isoDateTime) {
  const match = isoDateTime.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : isoDateTime;
}

// Mesajul zilnic trimis proactiv pe Telegram — formatare deterministă (fără Claude): e o simplă
// listare de date, nu are nevoie de interpretare de limbaj, deci rămâne rapid, gratuit și 100%
// previzibil (nu riscă să omită sau să parafrazeze greșit un eveniment).
export function formatDailyAgenda(events, dateLabel) {
  if (events.length === 0) {
    return `📅 Mâine (${dateLabel}) nu ai nimic programat în calendar.`;
  }

  const lines = events.map((ev) => {
    if (ev.allDay) return `• toată ziua — ${ev.title}`;
    return `• ${formatHM(ev.start)}–${formatHM(ev.end)} — ${ev.title}`;
  });

  return `📅 Mâine (${dateLabel}):\n${lines.join('\n')}`;
}
