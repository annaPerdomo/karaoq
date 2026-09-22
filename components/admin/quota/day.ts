/** Pinned to UTC noon so the calendar date never shifts with the viewer's zone. */
export function formatDay(day: string, weekday = false): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    ...(weekday ? { weekday: 'short' } : {}),
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
