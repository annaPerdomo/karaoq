import * as React from 'react';
import styles from '../../styles/HeroVideo.module.css';
import {
  DUET_SONG,
  GUEST_A,
  GUEST_B,
  GuestSpec,
  ROOM_CODE,
  SEARCH_RESULTS,
  T,
  TOAST_TEXT,
  easeOutCubic,
  pressStyle,
  pulseWindow,
  seg,
  typed,
} from './timeline';

// The real /sing welcome overlay (Sing.tsx) — opaque, so fading it reveals
// the in-room screen with no double exposure.
export function WelcomeGate({ t, name: fullName }: { t: number; name: string }) {
  // Two-step exit: the gate's content fades first, then the opaque panel
  // lifts to reveal the in-room screen — no frame carries both layouts.
  const contentOpacity = 1 - seg(t, T.welcomeSwap, T.welcomeSwap + 240);
  const panelOpacity = 1 - seg(t, T.welcomeSwap + 240, T.welcomeSwap + 520);
  if (panelOpacity <= 0.001) return null;
  const name = typed(t, T.guestTypeStart, T.guestTypeMsPerChar, fullName);
  const focused = t >= T.guestTypeStart - 300 && t < T.guestPress;
  const caretOn = focused && Math.floor((t - (T.guestTypeStart - 300)) / 500) % 2 === 0;
  return (
    <div className={styles.pWelcome} style={{ opacity: panelOpacity }}>
      <span className={styles.pWelcomeLogo} style={{ opacity: contentOpacity }}>
        KaraoQ
      </span>
      <span className={styles.pWelcomeRoom} style={{ opacity: contentOpacity }}>
        Room <strong>{ROOM_CODE}</strong>
      </span>
      <span className={styles.pWelcomePrompt} style={{ opacity: contentOpacity }}>
        What’s your name?
      </span>
      <span className={styles.pWelcomeInput} style={{ opacity: contentOpacity }}>
        {name && <span>{name}</span>}
        <span className={styles.cardCaret} style={{ opacity: caretOn ? 1 : 0, height: 20 }} />
        {!name && <span className={styles.cardPlaceholder}>Enter your name</span>}
      </span>
      <span
        className={styles.pWelcomeBtn}
        style={{ opacity: (name ? 1 : 0.4) * contentOpacity, ...pressStyle(t, T.guestPress) }}
      >
        Let’s go
      </span>
    </div>
  );
}

// Unlike tips/results/toast, the board card isn't gated on `searches` — it's
// shared room state, shown on both phones at once.
export function StageArea({ t, guest }: { t: number; guest: GuestSpec }) {
  const searches = guest.gate;
  // Naomi's banner is already up when she slides in (no blank screen);
  // Anna's waits for the name gate to lift.
  const tipsFrom = guest.gate ? T.welcomeSwap + 200 : guest.inStart - 100;
  const tips = pulseWindow(t, tipsFrom, (searches ? T.searchFocus : T.boardsIn) - 150, 340);
  const results = searches
    ? seg(t, T.resultsIn, T.resultsIn + 260) * (1 - seg(t, T.addTap + 240, T.addTap + 480))
    : 0;
  const toast = searches ? pulseWindow(t, T.toastIn, T.toastOut, 260) : 0;
  const boards =
    seg(t, T.boardsIn, T.boardsIn + 380) * (1 - seg(t, T.boardsOut, T.boardsOut + 300));
  // "Join" leaves before "✓ Joined" builds — the slight tail overlap keeps the
  // button from ever reading as an empty slot, without stacked-label mush.
  const joinOut = seg(t, T.joinedAt, T.joinedAt + 140);
  const joinedIn = seg(t, T.joinedAt + 100, T.joinedAt + 320);
  return (
    <div className={styles.pStage}>
      {tips > 0.001 && (
        <div className={styles.pTips} style={{ opacity: tips, transform: `translateY(${(1 - tips) * 6}px)` }}>
          <div className={styles.pTipsTitle}>Welcome, {guest.name}! 🎤</div>
          <div className={styles.pTipsBody}>
            Search any song to add it to the queue, follow along in Up Next, and cheer on
            whoever’s on stage.
          </div>
        </div>
      )}
      {results > 0.001 && (
        <div style={{ position: 'absolute', inset: 0, opacity: results }}>
          {SEARCH_RESULTS.map((r, i) => {
            const rowIn = seg(t, T.resultsIn + i * 90, T.resultsIn + i * 90 + 280, easeOutCubic);
            return (
              <div
                key={r.title}
                className={styles.pResult}
                style={{ opacity: rowIn, transform: `translateY(${(1 - rowIn) * 8}px)` }}
              >
                <span className={styles.pThumb} />
                <span className={styles.pResultTitle}>{r.title}</span>
                <span
                  className={r.tapped ? styles.pAdd : styles.pAddDim}
                  style={r.tapped ? pressStyle(t, T.addTap) : undefined}
                >
                  +
                </span>
              </div>
            );
          })}
        </div>
      )}
      {toast > 0.001 && (
        <div className={styles.pToast} style={{ opacity: toast, transform: `translateY(${(1 - toast) * 6}px)` }}>
          {TOAST_TEXT}
        </div>
      )}
      {/* Bottom-anchored: top-anchoring here leaves a hole in the middle of the
          phone once the cheer sheet folds away. */}
      {boards > 0.001 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            opacity: boards,
            transform: `translateY(${(1 - boards) * 8}px)`,
          }}
        >
          <span className={styles.pBoardsTab}>Sing together</span>
          <div className={styles.pBoardCard}>
            <span className={styles.pBoardSong}>{DUET_SONG}</span>
            <span className={styles.pBoardNames}>
              Singing: {GUEST_B}
              {joinedIn > 0.5 ? `, ${GUEST_A}` : ''}
            </span>
            <span className={styles.pBoardProgress}>
              <span className={styles.pBoardNeed} style={{ opacity: 1 - joinOut }}>
                needs 1 more singer
              </span>
              <span className={styles.pBoardQueued} style={{ opacity: joinedIn }}>
                In queue 🎶
              </span>
            </span>
            <span className={styles.pBoardActions}>
              <span className={styles.pBoardPreview}>▶ Preview</span>
              <span
                className={styles.pBoardJoin}
                style={searches ? pressStyle(t, T.joinTap) : undefined}
              >
                <span className={styles.pBoardJoinLive} style={{ opacity: 1 - joinOut }}>
                  Join
                </span>
                <span className={styles.pBoardJoinDone} style={{ opacity: joinedIn }}>
                  ✓ Joined
                </span>
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
