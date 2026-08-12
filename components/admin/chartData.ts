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
