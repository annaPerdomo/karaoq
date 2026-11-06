import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomDossierData } from '../types';
import { formatTime } from '../roomDetailLabels';
import { Section } from './DossierSections';

type MusicVideo = NonNullable<RoomDossierData['musicVideo']>;

// Matches the host card's CARD_WINDOW_MS; musicVideoAt refreshes only every 5 min.
const LIVE_WINDOW_MS = 12 * 60 * 1000;

function screenUsed(mv: MusicVideo): boolean {
  return Boolean(mv.lastSeenAt || mv.opens > 0 || mv.songsResolved > 0);
}

export function musicVideoTouched(mv: MusicVideo | undefined): mv is MusicVideo {
  return Boolean(mv && (screenUsed(mv) || mv.links.open + mv.links.copy > 0));
}

export function musicVideoLive(mv: MusicVideo): boolean {
  if (!mv.lastSeenAt) return false;
  return Date.now() - new Date(mv.lastSeenAt).getTime() < LIVE_WINDOW_MS;
}

export function musicVideoChipLabel(mv: MusicVideo): string {
  if (!screenUsed(mv)) return 'Music video: link only, no screen';
  return musicVideoLive(mv) ? 'Music video: on now' : 'Music video: used';
}

export function musicVideoChipTitle(mv: MusicVideo): string {
  if (mv.lastSeenAt) return `A music-video screen last checked in ${formatTime(mv.lastSeenAt)}`;
  return screenUsed(mv)
    ? 'Music-video events, but no screen check-in on the room'
    : 'The host opened or copied the link; no screen ever loaded';
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function MusicVideoPanel({
  musicVideo: mv,
  wide,
}: {
  musicVideo: MusicVideo;
  wide?: boolean;
}): React.ReactElement {
  const facts = [
    mv.opens > 0 &&
      `Screen opened ${mv.opens}× · first ${formatTime(mv.firstOpenedAt)}`,
    mv.lastSeenAt && `Last check-in ${formatTime(mv.lastSeenAt)}`,
    mv.minutesOpen !== null && `${mv.minutesOpen} min open (closed screens only)`,
    mv.songsResolved > 0 &&
      `${plural(mv.songsResolved, 'song')} looked up · ${mv.songsWithVideo} had a video`,
    mv.songsShown + mv.songsUnavailable > 0 &&
      `${mv.songsShown} shown · ${mv.songsUnavailable} unavailable`,
    mv.songsWaiting > 0 && `${plural(mv.songsWaiting, 'lookup')} blocked by quota/busy`,
    mv.swaps > 0 && `${plural(mv.swaps, 'swap')} by the host`,
    mv.hostNudges > 0 && `${plural(mv.hostNudges, 'timing save')} by the host`,
    mv.songsPlayedOffset > 0 &&
      `${plural(mv.songsPlayedOffset, 'song')} played with an offset`,
    mv.links.open + mv.links.copy > 0 &&
      `Link from gear: opened ${mv.links.open} · copied ${mv.links.copy}`,
    ...mv.errors.map((e) => `YouTube error ${e.code} ×${e.count}`),
    mv.truncated && 'Event cap hit — the earliest events aren’t counted',
  ].filter(Boolean) as string[];

  return (
    <Section title="Music video" wide={wide}>
      <div className={styles.setupToggles}>
        {facts.map((f) => (
          <span key={f} className={styles.dossierChip}>
            {f}
          </span>
        ))}
      </div>
    </Section>
  );
}
