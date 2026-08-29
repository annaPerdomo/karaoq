import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../../styles/HeroVideo.module.css';
import {
  JOIN_URL,
  LYRICS,
  ON_STAGE,
  QUEUE_ROWS,
  ROOM_CODE,
  T,
  TV_REACTIONS,
  clamp01,
  easeOutCubic,
  lerp,
  liveDotOpacity,
  pulseWindow,
  seg,
} from './timeline';

const ROW_H = 41; // 38px row + 3px gap
// 4 of the fixture's 6 queue rows show at once — the rest scroll off the top as new ones land.
const MAX_ROWS = 4;

// ms; each line sweeps once and holds lit — no mid-film reset, so lines never visibly wipe backwards.
const VERSE = {
  fadeIn: [7100, 7500],
  sweeps: [
    [7500, 10500],
    [10900, 13900],
    [14300, 17300],
  ],
} as const;

function lyricStyles(t: number) {
  const blockOpacity = seg(t, VERSE.fadeIn[0], VERSE.fadeIn[1]);
  const lines = VERSE.sweeps.map(([a, b]) => {
    const p = clamp01((t - a) / (b - a)); // 0 unsung → 1 sung, held lit
    return { backgroundPosition: `${(1 - p) * 100}% 0` };
  });
  return { blockOpacity, lines };
}

// Mirrors Display.tsx's waiting state: note mark + code, nothing else.
// The wash never fades with them — doing so left a one-frame blink on loop.
function ReadyStage({ t, opacity }: { t: number; opacity: number }) {
  // One restrained neon breath on the code — the ready beat's only motion.
  const glow = pulseWindow(t, T.codePulse, T.codePulse + 950, 470);
  return (
    <div className={styles.tvWaiting}>
      <div className={styles.tvWaitContent} style={{ opacity }}>
      <span className={styles.tvWaitIcon}>
        <svg width="92" height="92" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="kqHeroNote" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff2d78" />
              <stop offset="100%" stopColor="#00f0ff" />
            </linearGradient>
          </defs>
          <circle cx="18" cy="48" r="8" fill="url(#kqHeroNote)" />
          <circle cx="46" cy="40" r="8" fill="url(#kqHeroNote)" />
          <rect x="24" y="8" width="4" height="40" rx="2" fill="url(#kqHeroNote)" />
          <rect x="52" y="8" width="4" height="32" rx="2" fill="url(#kqHeroNote)" />
          <path d="M26 8 c4-4 22-8 28-4 v8 c-6-4-24 0-28 4z" fill="url(#kqHeroNote)" />
        </svg>
      </span>
      <span
        className={styles.tvWaitCode}
        style={{ textShadow: `0 0 ${16 + 10 * glow}px rgba(255, 215, 0, ${0.3 + 0.22 * glow})` }}
      >
        {ROOM_CODE}
      </span>
      </div>
    </div>
  );
}

function QueueRows({ t, opacity }: { t: number; opacity: number }) {
  const alive = QUEUE_ROWS.filter(
    (r) => t >= r.at && !(r.leavesAt && t >= r.leavesAt + 350),
  );
  // Implicit exits (no leavesAt) trigger when MAX_ROWS rows land after — same
  // animation as explicit ones, so the list never jumps.
  const exits = alive.map((r, i) => r.leavesAt ?? alive[i + MAX_ROWS]?.at);
  const rows = alive.filter((_, i) => !(exits[i] !== undefined && t >= exits[i]! + 350));
  const rowExits = exits.filter((_, i) => !(exits[i] !== undefined && t >= exits[i]! + 350));
  let slot = 0; // list position, counting rows above
  let shift = 0; // accumulated upward slide from rows leaving above
  return (
    <div className={styles.tvQueueRows} style={{ height: ROW_H * MAX_ROWS + 2, opacity }}>
      {rows.map((r, i) => {
        const exitAt = rowExits[i];
        const leaving = exitAt !== undefined ? seg(t, exitAt, exitAt + 320) : 0;
        const y = (slot - shift) * ROW_H;
        const num = Math.round(slot - shift) + 1;
        slot += 1;
        shift += leaving;
        const landing = seg(t, r.at, r.at + 340, easeOutCubic);
        // Flash rows (r.flash) pulse violet on landing; ambient rows just appear.
        const flash = r.flash ? pulseWindow(t, r.at, r.at + 1100, 380) : 0;
        return (
          <div
            key={`${r.singer}-${r.song}`}
            className={styles.tvQueueItem}
            style={{
              top: 0,
              transform: `translateY(${y + (1 - landing) * 6 - leaving * 8}px)`,
              opacity: landing * (1 - leaving),
              background: `rgba(${flash > 0 ? '139, 92, 246' : '255, 255, 255'}, ${
                flash > 0 ? lerp(0.035, 0.32, flash) : 0.035
              })`,
            }}
          >
            <span className={styles.tvQueueNum}>{num}</span>
            <span className={styles.tvQueueInfo}>
              <span className={styles.tvQueueSinger}>{r.singer}</span>
              <span className={styles.tvQueueSong}>{r.song}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Bezel/header/QR card are static chrome; only the stage area swaps between
// empty and playing, at T.liveStart and T.restStart.
export default function BigScreen({ t }: { t: number }) {
  const { blockOpacity, lines } = lyricStyles(t);

  // Sequenced swaps, not a cross-fade — overlapping the code and the lyrics would read as a ghost.
  const readyOut = seg(t, T.liveStart, T.liveStart + 280);
  const liveIn = seg(t, T.liveStart + 240, T.liveSettled);
  const live = liveIn * (1 - seg(t, T.restStart, T.restStart + 330));
  const ready = Math.max(1 - readyOut, seg(t, T.restStart + 300, T.restEnd - 50));

  // The count pill follows what the eye can verify: it ticks up only once a
  // row's fade-in is visible, and down mid-way through a row's exit.
  const queueCount = QUEUE_ROWS.filter(
    (r) => t >= r.at + 120 && !(r.leavesAt && t >= r.leavesAt + 160),
  ).length;
  // Rows exit as one group, not row-by-row, on the same beat the stage resets.
  const rowsOut = 1 - seg(t, T.restStart, T.restStart + 300);
  const emptyIn = queueCount === 0 ? 1 : seg(t, T.restStart + 250, T.restStart + 620);

  const progress = lerp(0.22, 0.78, clamp01((t - T.liveStart) / (T.restStart - T.liveStart)));
  const clock = 84 + Math.max(0, Math.floor((t - T.liveStart) / 1000));
  const clockLabel = `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`;

  return (
    <>
      <div className={styles.tvScreen}>
        <div className={styles.tvChrome} />
        <div className={styles.tvInner}>
          <div className={styles.tvHeader}>
            <span className={styles.tvBrand}>KaraoQ</span>
            <span className={styles.tvAddBar}>
              <span className={styles.tvAddIcon} />
              <span className={styles.tvAddText}>Search to add a song</span>
              <span className={styles.tvAddBtn}>+</span>
            </span>
          </div>

          <div className={styles.tvMain}>
            <ReadyStage t={t} opacity={ready} />
            {live > 0.001 && (
              <div className={styles.tvVideo} style={{ opacity: live }}>
                <span className={styles.tvYtBadge}>
                  <span className={styles.tvYtPlay} /> YouTube
                </span>
                <div className={styles.tvLyrics} style={{ opacity: blockOpacity }}>
                  {LYRICS.map((text, i) => (
                    <span key={i} className={styles.tvLyricLine} style={lines[i]}>
                      {text}
                    </span>
                  ))}
                </div>
                <div className={styles.tvReactionLane}>
                  {TV_REACTIONS.map((r) => {
                    const p = (t - r.at) / 2500;
                    if (p <= 0 || p >= 1) return null;
                    const rise = easeOutCubic(p);
                    const opacity = p < 0.09 ? p / 0.09 : p > 0.68 ? (1 - p) / 0.32 : 1;
                    return (
                      <span
                        key={r.emoji + r.at}
                        className={styles.tvReaction}
                        style={{
                          left: `${r.lane}%`,
                          opacity,
                          transform: `translate(${r.sway * rise}px, ${-172 * rise}px) scale(${
                            p < 0.09 ? lerp(0.6, 1, p / 0.09) : lerp(1, 0.85, rise)
                          })`,
                        }}
                      >
                        {r.emoji}
                      </span>
                    );
                  })}
                </div>
                <div className={styles.tvVideoBar}>
                  <span className={styles.tvVideoTime}>{clockLabel}</span>
                  <span className={styles.tvVideoProgress}>
                    <span className={styles.tvVideoProgressFill} style={{ width: `${progress * 100}%` }} />
                  </span>
                  <span className={styles.tvVideoTime}>3:48</span>
                </div>
              </div>
            )}
            {live > 0.001 && (
              <div
                className={styles.tvNowBar}
                style={{ opacity: live, transform: `translateY(${(1 - live) * 18}px)` }}
              >
                <span className={styles.tvNowDot} style={{ opacity: liveDotOpacity(t) }} />
                <span className={styles.tvNowLabel}>ON STAGE</span>
                <span className={styles.tvNowSinger}>{ON_STAGE.singer}</span>
                <span className={styles.tvNowSong}>{ON_STAGE.song}</span>
              </div>
            )}
          </div>

          <div className={styles.tvSidebar}>
            <div className={styles.tvQr}>
              <div className={styles.tvQrTile}>
                <QRCodeSVG value={JOIN_URL} size={76} bgColor="transparent" fgColor="#ffffff" level="M" />
              </div>
              <span className={styles.tvQrLabel}>SCAN TO JOIN</span>
              <span className={styles.tvQrCode}>{ROOM_CODE}</span>
            </div>
            <div className={styles.tvQueue}>
              <div className={styles.tvQueueTitle}>
                Up Next
                {queueCount > 0 && (
                  <span className={styles.tvQueueCount} style={{ opacity: rowsOut }}>
                    {queueCount}
                  </span>
                )}
              </div>
              <div className={styles.tvQueueBody}>
                {emptyIn > 0.001 && (
                  <div className={styles.tvQueueEmpty} style={{ opacity: emptyIn }}>
                    No songs queued yet
                  </div>
                )}
                {queueCount > 0 && rowsOut > 0.001 && <QueueRows t={t} opacity={rowsOut} />}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.tvStand} />
    </>
  );
}
