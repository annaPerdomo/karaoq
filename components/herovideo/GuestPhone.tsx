import * as React from 'react';
import styles from '../../styles/HeroVideo.module.css';
import { StageArea, WelcomeGate } from './PhoneScreens';
import {
  CHEER_EMOJIS,
  GuestSpec,
  ON_STAGE,
  QUEUE_ROWS,
  ROOM_CODE,
  SEARCH_QUERY,
  T,
  clamp01,
  easeOutCubic,
  pressStyle,
  pulseWindow,
  rippleState,
  seg,
  typed,
} from './timeline';

/** When this guest's screen is the in-room one rather than the name gate. */
function inRoomAt(guest: GuestSpec) {
  return guest.gate ? T.welcomeSwap - 250 : guest.inStart - 200;
}

// Now Playing + CheerBar + drawer, pinned to the thumb zone. Same sheet for both guests.
function BottomStack({ t, guest }: { t: number; guest: GuestSpec }) {
  const inRoom = seg(t, inRoomAt(guest), inRoomAt(guest) + 200);
  const live = seg(t, T.cheerUiIn, T.cheerUiIn + 420);
  const cheers = !guest.gate; // Naomi is the one who cheers
  // Folds when the phone's stage needs the room (search for Anna, board card for
  // Naomi) — without it Naomi's board card overlaps her emoji grid. Opacity leads
  // the height collapse so rows fade before the fold clips them.
  const foldAt = guest.gate ? T.searchFocus : T.boardsIn;
  const cheerFold = seg(t, foldAt - 250, foldAt + 150);
  const cheerShow = live * (1 - Math.min(1, cheerFold * 1.8));
  const sent = cheers ? pulseWindow(t, T.cheerTap + 150, T.cheerSentUntil, 240) : 0;
  const cooldown = cheers ? clamp01((t - T.cheerTap) / 3000) : 0;
  const upNext = QUEUE_ROWS.filter(
    (r) => t >= r.at + 120 && !(r.leavesAt && t >= r.leavesAt + 160),
  ).length;
  const drawerLive = t >= T.liveStart + 400;
  return (
    <div className={styles.pBottom} style={{ opacity: inRoom }}>
      {live > 0.001 && (
        <>
          <div className={styles.pNow} style={{ opacity: live, transform: `translateY(${(1 - live) * 10}px)` }}>
            <span className={styles.pNowDot} />
            <span className={styles.pNowInfo}>
              <span className={styles.pNowLabel}>Now Playing</span>
              <span className={styles.pNowSong}>
                {ON_STAGE.singer} — {ON_STAGE.song}
              </span>
            </span>
          </div>
          {cheerShow > 0.001 && (
            <div
              className={styles.pCheer}
              style={{
                opacity: cheerShow,
                // border-box: content (104px, +13 while the cooldown bar runs)
                // plus the 22px of vertical padding.
                height: (1 - cheerFold) * (126 + 13 * (cheers ? seg(t, T.cheerTap, T.cheerTap + 220) : 0)),
                paddingTop: (1 - cheerFold) * 11,
                paddingBottom: (1 - cheerFold) * 11,
                overflow: 'hidden',
                transform: `translateY(${(1 - live) * 10}px)`,
              }}
            >
              <div className={styles.pCheerHead}>
                <span className={styles.pCheerLabel}>Cheer them on!</span>
                <span className={styles.pCheerSent} style={{ opacity: sent }}>
                  ❤️ Sent!
                </span>
              </div>
              <div className={styles.pCheerGrid}>
                {CHEER_EMOJIS.map((e) => (
                  <span
                    key={e}
                    className={styles.pCheerBtn}
                    style={{
                      ...(cheers && e === '❤️' ? pressStyle(t, T.cheerTap) : {}),
                      ...(cooldown > 0 && cooldown < 1 && e !== '❤️' ? { opacity: 0.45 } : {}),
                    }}
                  >
                    {e}
                  </span>
                ))}
              </div>
              {cooldown > 0 && cooldown < 1 && (
                <div className={styles.pCheerCooldown} style={{ transform: `scaleX(${1 - cooldown})` }} />
              )}
            </div>
          )}
        </>
      )}
      <div className={styles.pDrawer}>
        {drawerLive ? (
          <>
            <span className={styles.pDrawerDot} />
            <span className={styles.pDrawerNow}>
              {ON_STAGE.singer} · {ON_STAGE.song}
            </span>
          </>
        ) : (
          <span className={styles.pDrawerNow}>Queue</span>
        )}
        {upNext > 0 && <span className={styles.pDrawerBadge}>{upNext} up next</span>}
      </div>
    </div>
  );
}

// Mirrors Sing.tsx / SongSearch.tsx / SocialBoards — same app, different guest per `guest.gate`.
export default function GuestPhone({ t, guest }: { t: number; guest: GuestSpec }) {
  const slideIn = seg(t, guest.inStart, guest.inEnd, easeOutCubic);
  const slideOut = seg(t, guest.outStart, guest.outEnd);
  const opacity = slideIn * (1 - slideOut);
  if (opacity <= 0.001) return null;

  const inRoom = seg(t, inRoomAt(guest), inRoomAt(guest) + 200);
  const searches = guest.gate; // Anna is the one who adds a song
  // The real app clears the search once the add lands — back to browse.
  const query =
    searches && t < T.toastIn ? typed(t, T.searchTypeStart, T.searchTypeMsPerChar, SEARCH_QUERY) : '';
  const searching = searches && t >= T.searchFocus && t < T.toastIn;
  const caretOn = searching && t < T.searchPress && Math.floor((t - T.searchFocus) / 500) % 2 === 0;

  return (
    <div
      className={styles.phoneGroup}
      style={{
        left: guest.x,
        top: guest.y,
        opacity,
        transform: `translateX(${(1 - slideIn) * 340 + slideOut * 90}px) scale(${guest.scale})`,
      }}
    >
      <div className={styles.phoneBody}>
        <span className={styles.phoneNotch} />
        <div className={styles.phoneScreen}>
          {inRoom > 0.001 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                opacity: inRoom,
              }}
            >
              <div className={styles.pHeader}>
                <span className={styles.pBrand}>KaraoQ</span>
                <span className={styles.pRoomBadge}>
                  Room: <strong>{ROOM_CODE}</strong>
                </span>
              </div>
              <div className={styles.pSearchRow}>
                <span
                  className={styles.pSearchInput}
                  style={searching ? { borderColor: 'rgba(255, 45, 120, 0.4)' } : undefined}
                >
                  {query && <span>{query}</span>}
                  {searching && t < T.searchPress && (
                    <span className={styles.cardCaret} style={{ opacity: caretOn ? 1 : 0, height: 17 }} />
                  )}
                  {!query && <span className={styles.cardPlaceholder}>Song title or link...</span>}
                </span>
                <span
                  className={styles.pSearchBtn}
                  style={searches ? pressStyle(t, T.searchPress) : undefined}
                >
                  Search
                </span>
              </div>
              <StageArea t={t} guest={guest} />
              <BottomStack t={t} guest={guest} />
            </div>
          )}
          {guest.gate && <WelcomeGate t={t} name={guest.name} />}
          {guest.ripples.map((r) => {
            const s = rippleState(t, r.at);
            if (!s) return null;
            return (
              <div
                key={r.at}
                className={styles.ripple}
                style={{ left: r.x, top: r.y, opacity: s.opacity, transform: `scale(${s.scale * 0.7})` }}
              />
            );
          })}
        </div>
        <span className={styles.phoneHomeBar} />
      </div>
    </div>
  );
}
