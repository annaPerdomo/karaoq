import type { BarListRow } from '../charts/BarList';
import type { LogoRejectReason, ResolveSource, ScreensStats } from './types';

export const RESOLVE_LABELS: Record<ResolveSource, string> = {
  cache: 'From cache',
  live: 'Live search',
  quota: 'Quota out',
  busy: 'Busy',
  none: 'Not found',
};

export const REJECT_LABELS: Record<LogoRejectReason, string> = {
  type: 'Not PNG/JPEG/WebP',
  size: 'Over 64 KB',
  storage_full: 'Storage full',
};

export const STORAGE_WARN_SHARE = 0.8;

function errorLabel(code: number): string {
  if (code === 100) return 'Removed';
  if (code === 101 || code === 150) return 'Embedding blocked';
  return 'Other';
}

/** 101 and 150 are the same failure under two codes, so they share a row. */
export function errorRows(errors: { code: number; count: number }[]): BarListRow[] {
  const byLabel = new Map<string, { value: number; codes: number[] }>();
  for (const e of errors) {
    const label = errorLabel(e.code);
    const row = byLabel.get(label) ?? { value: 0, codes: [] };
    row.value += e.count;
    row.codes.push(e.code);
    byLabel.set(label, row);
  }
  return Array.from(byLabel.entries())
    .map(([label, row]) => ({
      label,
      value: row.value,
      title: `${label} (code ${row.codes.join(', ')}) — ${row.value.toLocaleString('en-US')}`,
    }))
    .sort((a, b) => b.value - a.value);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function hasActivity(stats: ScreensStats): boolean {
  const mv = stats.musicVideo;
  const b = stats.brand;
  const resolved = Object.keys(mv.resolve).reduce(
    (sum, k) => sum + mv.resolve[k as ResolveSource],
    0
  );
  const rejected = Object.keys(b.rejected).reduce(
    (sum, k) => sum + b.rejected[k as LogoRejectReason],
    0
  );
  return (
    mv.opens + resolved + mv.errors.length + mv.songsNudged + mv.links.open + mv.links.copy > 0 ||
    mv.swaps + mv.songsShown + mv.songsUnavailable + mv.songsResolved > 0 ||
    b.saves.host + b.saves.display + b.uploads + rejected + b.clears > 0 ||
    b.roomsWithLogo + b.roomsWithColors > 0 ||
    b.storageBytes > 0 ||
    b.committedLogos > 0 ||
    stats.karaokeSwap.swaps + stats.karaokeSwap.opens > 0 ||
    stats.feedback.length > 0
  );
}
