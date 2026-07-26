import * as React from 'react';
import styles from '../../styles/Analytics.module.css';
import type { DisplayConfig, HostConfig } from '../../pages/api/types';

// Nominal screens the stored pixel sizes are rendered as fractions of.
const TV = { w: 1280, h: 720 };
const LAPTOP = { w: 1440, h: 900 };

const MIN_SIDEBAR = 18;
const MAX_SIDEBAR = 45;
const MIN_BAR = 8;
const MAX_BAR = 40;

function proportion(px: number, of: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, (px / of) * 100)));
}

function truncate(text: string, max = 22): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface Block {
  key: string;
  label: string;
  grow?: boolean;
}

function Surface({
  title,
  subtitle,
  theme,
  side,
  sidebarPct,
  sidebarPx,
  stageLabel,
  barPct,
  barLabel,
  blocks,
  hidden,
}: {
  title: string;
  subtitle: string;
  theme: string;
  side: 'left' | 'right';
  sidebarPct: number;
  sidebarPx: number;
  stageLabel: string;
  barPct: number | null;
  barLabel: string;
  blocks: Block[];
  hidden: string[];
}) {
  return (
    <section className={styles.lpSurface}>
      <div className={styles.lpHead}>
        <h3 className={styles.lpTitle}>{title}</h3>
        <span className={styles.lpTheme}>{theme}</span>
      </div>

      <div
        className={`${styles.lpScreen} ${side === 'left' ? styles.lpScreenLeft : ''}`}
      >
        <div className={styles.lpMain}>
          <div className={styles.lpStage}>{stageLabel}</div>
          {barPct !== null && (
            <div className={styles.lpBar} style={{ height: `${barPct}%` }}>
              {barLabel}
            </div>
          )}
        </div>
        <div className={styles.lpSidebar} style={{ width: `${sidebarPct}%` }}>
          {blocks.length === 0 ? (
            <div className={styles.lpBlockEmpty}>everything hidden</div>
          ) : (
            blocks.map((b) => (
              <div
                key={b.key}
                className={`${styles.lpBlock} ${b.grow ? styles.lpBlockGrow : ''}`}
              >
                {b.label}
              </div>
            ))
          )}
        </div>
      </div>

      <p className={styles.lpMeta}>
        Sidebar {side} · {sidebarPx}px{subtitle ? ` · ${subtitle}` : ''}
      </p>
      {hidden.length > 0 && (
        <p className={styles.lpHidden}>Hidden: {hidden.join(', ')}</p>
      )}
    </section>
  );
}

/** Boards' on/off is a room flag outside DisplayConfig, so the preview shows
 * the slot without claiming its state. */
export function displayBlocks(c: DisplayConfig): { blocks: Block[]; hidden: string[] } {
  const blocks: Block[] = [];
  const hidden: string[] = [];
  for (const section of c.sidebarOrder) {
    switch (section) {
      case 'qr':
        if (c.qrSize === 'hidden') hidden.push('QR');
        else blocks.push({ key: 'qr', label: `QR ${c.qrPx}px` });
        break;
      case 'banner':
        if (!c.bannerLine) hidden.push('Banner');
        else {
          blocks.push({
            key: 'banner',
            label: `“${truncate(c.bannerLine)}” ${c.bannerPx}px`,
          });
        }
        break;
      case 'upNext':
        if (!c.showUpNext) hidden.push('Up next');
        else {
          blocks.push({
            key: 'upNext',
            label: `Up next · ${c.upNextCount}`,
            grow: true,
          });
        }
        break;
      case 'boards':
        blocks.push({ key: 'boards', label: 'Boards*' });
        break;
    }
  }
  return { blocks, hidden };
}

export function hostBlocks(c: HostConfig): { blocks: Block[]; hidden: string[] } {
  const blocks: Block[] = [];
  const hidden: string[] = [];
  for (const section of c.sectionOrder) {
    switch (section) {
      case 'queue':
        blocks.push({ key: 'queue', label: 'Queue', grow: true });
        break;
      case 'boards':
        if (!c.showBoards) hidden.push('Boards');
        else blocks.push({ key: 'boards', label: 'Boards' });
        break;
      case 'qr':
        if (!c.showQr) hidden.push('QR shelf');
        else blocks.push({ key: 'qr', label: `QR ${c.qrPx}px` });
        break;
      case 'banner':
        if (!c.bannerLine) hidden.push('Banner');
        else {
          blocks.push({
            key: 'banner',
            label: `“${truncate(c.bannerLine)}” ${c.bannerPx}px`,
          });
        }
        break;
    }
  }
  return { blocks, hidden };
}

const LayoutPreview = ({
  display,
  host,
  displaySaves,
  hostSaves,
}: {
  display: DisplayConfig | null;
  host: HostConfig | null;
  displaySaves: number;
  hostSaves: number;
}): React.ReactElement => {
  if (!display && !host) {
    return (
      <p className={styles.detailEmpty}>
        This room never saved a custom layout — both screens ran on the
        defaults.
      </p>
    );
  }

  const displayParts = display ? displayBlocks(display) : null;
  const hostParts = host ? hostBlocks(host) : null;

  return (
    <div className={styles.lpGrid}>
      {display && displayParts ? (
        <Surface
          title="Display (TV)"
          subtitle={`${displaySaves} save${displaySaves === 1 ? '' : 's'}`}
          theme={display.theme}
          side={display.sidebarPosition}
          sidebarPct={proportion(display.sidebarWidth, TV.w, MIN_SIDEBAR, MAX_SIDEBAR)}
          sidebarPx={display.sidebarWidth}
          stageLabel="Video"
          barPct={
            display.showNowPlaying
              ? proportion(display.nowPlayingHeight, TV.h, MIN_BAR, MAX_BAR)
              : null
          }
          barLabel={`Now playing · ${display.nowPlayingHeight}px`}
          blocks={displayParts.blocks}
          hidden={[
            ...displayParts.hidden,
            ...(display.showNowPlaying ? [] : ['Now playing']),
          ]}
        />
      ) : (
        <p className={styles.detailEmpty}>The TV display ran on the defaults.</p>
      )}

      {host && hostParts ? (
        <Surface
          title="Host screen"
          subtitle={`${hostSaves} save${hostSaves === 1 ? '' : 's'}`}
          theme={host.theme}
          side={host.sidebarPosition}
          sidebarPct={proportion(host.sidebarWidth, LAPTOP.w, MIN_SIDEBAR, MAX_SIDEBAR)}
          sidebarPx={host.sidebarWidth}
          stageLabel="Player"
          // The host transport bar is never hideable, so it always draws.
          barPct={proportion(host.nowPlayingHeight, LAPTOP.h, MIN_BAR, MAX_BAR)}
          barLabel={`Transport · ${host.nowPlayingHeight}px`}
          blocks={hostParts.blocks}
          hidden={hostParts.hidden}
        />
      ) : (
        <p className={styles.detailEmpty}>The host screen ran on the defaults.</p>
      )}

      <p className={styles.lpFootnote}>
        * Boards show on the TV via a room setting that isn&rsquo;t part of the
        saved layout, so the slot is drawn without claiming its on/off state.
      </p>
    </div>
  );
};

export default LayoutPreview;
