export interface DayCount {
  _id: string;
  count: number;
}

// new Date('YYYY-MM-DD') would parse as UTC midnight, shifting labels back a
// day for viewers west of Greenwich.
function formatDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// The server omits days with no events.
export function fillDays(rows: DayCount[], days: number): { label: string; value: number }[] {
  if (rows.length === 0) return [];
  const byKey = new Map(rows.map((r) => [r._id, r.count]));
  const now = new Date();
  const filled: { label: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDayKey(d);
    filled.push({ label: formatDate(key), value: byKey.get(key) ?? 0 });
  }
  return filled;
}

export interface StackedDatum {
  label: string;
  title?: string;
  segments: number[];
}

export function fillDaysStacked<T extends { _id: string }>(
  rows: T[],
  days: number,
  width: number,
  pick: (row: T) => number[]
): StackedDatum[] {
  if (rows.length === 0) return [];
  const byKey = new Map(rows.map((r) => [r._id, r]));
  const now = new Date();
  const filled: StackedDatum[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDayKey(d);
    const row = byKey.get(key);
    const segments = row ? pick(row) : [];
    filled.push({
      label: formatDate(key),
      segments: Array.from({ length: width }, (_, s) => segments[s] ?? 0),
    });
  }
  return filled;
}

// Calendar-day buckets ending on a partial today, so the newest one only
// approximates the rolling "Last 7 days" tiles. A leading partial week is dropped.
export function bucketWeeks(daily: StackedDatum[]): StackedDatum[] {
  const weeks: StackedDatum[] = [];
  for (let end = daily.length; end - 7 >= 0; end -= 7) {
    const slice = daily.slice(end - 7, end);
    const width = slice[0].segments.length;
    const segments = Array.from({ length: width }, (_, s) =>
      slice.reduce((sum, d) => sum + (d.segments[s] ?? 0), 0)
    );
    weeks.unshift({
      label: slice[0].label,
      title: `${slice[0].label} – ${slice[6].label}`,
      segments,
    });
  }
  return weeks;
}
