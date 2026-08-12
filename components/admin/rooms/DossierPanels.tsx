import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomDossierData } from '../types';
import { formatTime } from '../roomDetailLabels';
import BarList from '../charts/BarList';
import LayoutPreview from '../LayoutPreview';
import { Section } from './DossierSections';

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
  wide,
}: {
  layout: RoomDossierData['layout'];
  fair: RoomDossierData['fairRotation'];
  wide?: boolean;
}): React.ReactElement {
  return (
    <Section title="Room setup" wide={wide}>
      {fair.toggles.length > 0 && (
        <div className={styles.setupToggles}>
          {fair.toggles.map((t, i) => (
            <span key={i} className={styles.dossierChip}>
              {formatTime(t.timestamp)} — fair rotation {t.enabled ? 'on' : 'off'}
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
