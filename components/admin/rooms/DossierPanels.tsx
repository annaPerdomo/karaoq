import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomDossierData } from '../types';
import { formatTime } from '../roomDetailLabels';
import BarList from '../charts/BarList';
import LayoutPreview from '../LayoutPreview';
import { Section } from './DossierSections';

export function PlaybackPanel({
  playback,
  wide,
}: {
  playback: NonNullable<RoomDossierData['playback']>;
  wide?: boolean;
}): React.ReactElement {
  const { bySurface } = playback;
  const surface =
    bySurface.display && bySurface.host
      ? `${bySurface.display} on the display, ${bySurface.host} on the host`
      : bySurface.display
        ? 'all on the display'
        : bySurface.host
          ? 'all on the host page'
          : null;
  const rows = [
    { label: 'Sung to the end', value: playback.ended },
    { label: 'Cut by the song limit', value: playback.limit },
    { label: 'Embed refused', value: playback.embedFailed },
    { label: 'Skipped mid-song', value: playback.skipped },
    { label: 'Stopped mid-song', value: playback.stopped },
    { label: 'Stepped between songs', value: playback.stepped },
    { label: 'Waited on the autoplay tap', value: playback.slowStarts },
  ].filter((r) => r.value > 0);
  return (
    <Section title="Playback" count={playback.started} wide={wide}>
      <p className={styles.dsNote}>
        {playback.started} {playback.started === 1 ? 'song' : 'songs'} confirmed playing
        {surface ? ` · ${surface}` : ''}
      </p>
      {rows.length > 0 && <BarList data={rows} />}
    </Section>
  );
}

/** Only rendered when the room actually got cheers — see RoomDossier. */
export function CheersPanel({
  cheers,
  wide,
}: {
  cheers: NonNullable<RoomDossierData['cheers']>;
  wide?: boolean;
}): React.ReactElement {
  return (
    <Section title="Cheers" count={cheers.total} wide={wide}>
      <div className={styles.cheerEmoji}>
        {cheers.byEmoji.map((e) => (
          <span key={e.emoji} className={styles.cheerChip}>
            <span className={styles.cheerGlyph}>{e.emoji}</span>
            <span className={styles.cheerCount}>{e.count}</span>
          </span>
        ))}
      </div>
      {cheers.topCheerers.length > 0 && (
        <BarList
          data={cheers.topCheerers.map((c) => ({
            label: c.userName,
            value: c.count,
          }))}
        />
      )}
    </Section>
  );
}

/** Only rendered when something was customized or toggled — see RoomDossier. */
export function SetupPanel({
  layout,
  fair,
  autoAdvance,
  wide,
}: {
  layout: RoomDossierData['layout'];
  fair: RoomDossierData['fairRotation'];
  autoAdvance: RoomDossierData['autoAdvance'];
  wide?: boolean;
}): React.ReactElement {
  return (
    <Section title="Room setup" wide={wide}>
      {(fair.toggles.length > 0 || autoAdvance.toggles.length > 0) && (
        <div className={styles.setupToggles}>
          {fair.toggles.map((t, i) => (
            <span key={`fair-${i}`} className={styles.dossierChip}>
              {formatTime(t.timestamp)} — fair rotation {t.enabled ? 'on' : 'off'}
            </span>
          ))}
          {autoAdvance.toggles.map((t, i) => (
            <span key={`auto-${i}`} className={styles.dossierChip}>
              {formatTime(t.timestamp)} — auto-advance {t.enabled ? 'on' : 'off'} ·{' '}
              {t.gapSeconds}s gap
            </span>
          ))}
        </div>
      )}
      {layout && (layout.display || layout.host) ? (
        <LayoutPreview
          display={layout.display}
          host={layout.host}
          displaySaves={layout.displaySaves}
          hostSaves={layout.hostSaves}
        />
      ) : (
        <p className={styles.dsEmpty}>
          Ran on the default layout — nothing was customized.
        </p>
      )}
    </Section>
  );
}
