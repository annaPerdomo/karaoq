import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData, SurfaceCustomization } from '../types';
import { VIA_LABELS, pct } from '../format';
import BarList from '../charts/BarList';
import { SERIES } from '../charts/palette';

// qrSize mirrors qrPx and is filtered out to avoid double-counting resizes;
// retired fields still appear on historical events.
const DISPLAY_FIELD_LABELS: Record<string, string> = {
  theme: 'Theme',
  qrPx: 'QR size',
  showUpNext: 'Up-next list on/off',
  upNextCount: 'Up-next depth',
  showNowPlaying: 'Now-playing bar',
  showReactions: 'Cheer overlay',
  sidebarPosition: 'Sidebar side',
  sidebarWidth: 'Sidebar width',
  sidebarOrder: 'Sidebar order',
  bannerLine: 'Announcement banner',
  bannerPx: 'Banner text size',
  nowPlayingHeight: 'Now-playing bar size',
  welcomeLine: 'Welcome message (retired)',
  attractMode: 'Idle promo screen (retired)',
  boardsOnDisplay: 'Boards on TV',
};

const HOST_FIELD_LABELS: Record<string, string> = {
  theme: 'Theme',
  qrPx: 'QR size',
  sidebarPosition: 'Sidebar side',
  sidebarWidth: 'Sidebar width',
  sectionOrder: 'Section order',
  showBoards: 'Boards roll-up on/off',
  showQr: 'QR shelf on/off',
  bannerLine: 'Announcement banner',
  bannerPx: 'Banner text size',
  nowPlayingHeight: 'Playback bar size',
  showHistory: 'History tab (retired)',
};

function CustomizeCard({
  title,
  surface,
  fieldLabels,
  color,
}: {
  title: string;
  surface: SurfaceCustomization;
  fieldLabels: Record<string, string>;
  color: string;
}): React.ReactElement {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <p className={styles.cardNote}>
        {surface.saves} applies · {surface.roomsCustomized} rooms changed something
        {surface.themes.length > 0 &&
          ` · themes: ${surface.themes.map((t) => `${t._id} ${t.count}`).join(', ')}`}
      </p>
      <BarList
        color={color}
        data={surface.changedFields
          .filter((f) => f._id !== 'qrSize')
          .map((f) => ({ label: fieldLabels[f._id] ?? f._id, value: f.count }))}
        maxRows={10}
      />
    </section>
  );
}

export default function PulseFeatures({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement {
  const { social, rotation, display, hostSurface } = data;

  return (
    <>
      {social && (
        <div className={styles.cardPair}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Songs added by source</h2>
            <BarList
              data={social.addsByVia.map((d) => ({
                label: VIA_LABELS[d._id] ?? d._id,
                value: d.count,
              }))}
            />
          </section>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Boards</h2>
            <p className={styles.cardNote}>
              Sing together: {social.singWithMe.posted} posts ·{' '}
              {social.singWithMe.joined} joins · {social.singWithMe.queued} queued (
              {pct(social.singWithMe.queued, social.singWithMe.posted)}% reached min
              singers)
            </p>
            <p className={styles.cardNote}>
              Request board: {social.board.suggested} requests ·{' '}
              {social.board.claimed} claimed (
              {pct(social.board.claimed, social.board.suggested)}% claim rate)
            </p>
          </section>
        </div>
      )}

      {rotation && (
        <div className={styles.cardPair}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Fair rotation</h2>
            <p className={styles.cardNote}>
              {rotation.fairRooms} rooms tracked · {rotation.fairEndedOn} ended on (
              {pct(rotation.fairEndedOn, rotation.fairRooms)}%) ·{' '}
              {rotation.fairToggled} hosts changed it
            </p>
          </section>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Duets &amp; groups</h2>
            <p className={styles.cardNote}>
              {rotation.duetAdds} multi-singer adds (
              {pct(rotation.duetAdds, rotation.trackedAdds)}% of tracked adds)
            </p>
            {rotation.bySize.length > 0 && (
              <BarList
                color={SERIES[2]}
                data={rotation.bySize.map((d) => ({
                  label: `${d._id} singers`,
                  value: d.count,
                }))}
              />
            )}
          </section>
        </div>
      )}

      {(display || hostSurface) && (
        <div className={styles.cardPair}>
          {display && (
            <CustomizeCard
              title="Display (TV) customization"
              surface={display}
              fieldLabels={DISPLAY_FIELD_LABELS}
              color={SERIES[0]}
            />
          )}
          {hostSurface && (
            <CustomizeCard
              title="Host screen customization"
              surface={hostSurface}
              fieldLabels={HOST_FIELD_LABELS}
              color={SERIES[2]}
            />
          )}
        </div>
      )}
    </>
  );
}
