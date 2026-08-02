import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import CheerBar from '../CheerBar';
import QueuePanel from './QueuePanel';
import YourTurnCard from './YourTurnCard';
import { MyTurn } from './YourTurnCard';
import { SingQueueViewProps } from './SingSidebar';
import formatSongTitle from '../../lib/songTitle';
import { CHEER_EMOJIS } from '../../app/queue/cheerConstants';
import { formatApproxDuration } from '../../lib/queueTime';
import { useT } from '../../lib/i18n/I18nProvider';

const DRAG_START_PX = 8;
const DRAG_COMMIT_PX = 40;
const DRAWER_COLLAPSED_PX = 52; // matches the 3.25rem collapsed max-height

/** The phone surface: a drag-to-open sheet over the search panel. Owns its own
 * drag state — nothing outside it cares how far it's been pulled. */
const MobileQueueDrawer = ({
  open,
  onOpenChange,
  myTurn,
  ...view
}: SingQueueViewProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the viewer sits in the running order, for the handle's badge. */
  myTurn: MyTurn | null;
}): React.ReactElement => {
  const { t } = useT();
  const {
    upcoming,
    queueItems,
    currentSong,
    isPlaying,
    reactionsOn,
    username,
    estimate,
    sessionEndsAt,
    viewerName,
    loading,
    onReaction,
    reactionCooldown,
    lastSentEmoji,
  } = view;

  const [dragHeight, setDragHeight] = React.useState<number | null>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef({ startY: 0, startHeight: 0, delta: 0, dragging: false });

  function handleTouchStart(e: React.TouchEvent) {
    drag.current = {
      startY: e.touches[0].clientY,
      startHeight: drawerRef.current?.getBoundingClientRect().height ?? 0,
      delta: 0,
      dragging: false,
    };
  }

  function handleTouchMove(e: React.TouchEvent) {
    const d = drag.current;
    d.delta = d.startY - e.touches[0].clientY;
    if (!d.dragging && Math.abs(d.delta) < DRAG_START_PX) return;
    d.dragging = true;
    const maxHeight = window.innerHeight * 0.75; // matches the 75vh open max-height
    setDragHeight(
      Math.min(Math.max(d.startHeight + d.delta, DRAWER_COLLAPSED_PX), maxHeight)
    );
  }

  function handleTouchEnd() {
    const d = drag.current;
    if (!d.dragging) return;
    if (d.delta > DRAG_COMMIT_PX) onOpenChange(true);
    else if (d.delta < -DRAG_COMMIT_PX) onOpenChange(false);
    setDragHeight(null);
  }

  function handleHandleClick() {
    // A drag can synthesize a click on release; only toggle on real taps.
    if (drag.current.dragging) return;
    onOpenChange(!open);
  }

  const showingNowPlaying = !!(currentSong && isPlaying);
  const quickCheerVisible = showingNowPlaying && reactionsOn && !open;

  return (
    <div
      ref={drawerRef}
      className={`${styles.mobileDrawer} ${quickCheerVisible ? styles.mobileDrawerCheer : ''} ${open ? styles.mobileDrawerOpen : ''} ${dragHeight !== null ? styles.mobileDrawerDragging : ''}`}
      style={
        dragHeight !== null
          ? { maxHeight: dragHeight, transition: 'none' }
          : undefined
      }
    >
      <button
        className={styles.drawerHandle}
        onClick={handleHandleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => setDragHeight(null)}
        aria-expanded={open}
      >
        <span className={styles.drawerGrabber} />
        {showingNowPlaying ? (
          <>
            <span className={styles.nowDot} />
            <div className={styles.drawerNowPlaying}>
              <span className={styles.drawerSinger}>{currentSong!.userName}</span>
              <span className={styles.drawerSongTitle}>
                {formatSongTitle(currentSong!.songTitle)}
              </span>
            </div>
          </>
        ) : (
          <span className={styles.drawerLabel}>{t('sing.drawer.queue')}</span>
        )}
        {/* Their own wait outranks the queue length: on a phone this handle is
            often all a singer sees of the queue. */}
        {myTurn ? (
          <span className={`${styles.drawerBadge} ${styles.drawerBadgeMine}`}>
            {myTurn.onStage
              ? t('sing.eta.yourTurnNow')
              : myTurn.imminent
                ? t('sing.eta.yourTurnNext')
                : t('sing.eta.badge', {
                    time: formatApproxDuration(myTurn.secondsAway, t),
                  })}
          </span>
        ) : (
          queueItems.length > 0 && (
            <span className={styles.drawerBadge}>
              {t('sing.drawer.upNext', { count: queueItems.length })}
            </span>
          )
        )}
        <span className={`${styles.drawerChevron} ${open ? styles.drawerChevronOpen : ''}`}>
          &#x25B2;
        </span>
      </button>

      {quickCheerVisible && (
        <div className={styles.quickCheerRow}>
          {CHEER_EMOJIS.slice(0, 5).map((emoji) => (
            <button
              key={emoji}
              className={`${styles.quickCheerBtn} ${reactionCooldown ? styles.quickCheerBtnCooldown : ''}`}
              onClick={() => onReaction(emoji)}
              disabled={reactionCooldown || !username.trim()}
              aria-label={t('sing.cheer.sendAria', { emoji })}
            >
              {emoji}
            </button>
          ))}
          {lastSentEmoji ? (
            <span className={styles.quickCheerSent}>
              {t('sing.quickCheer.sent', { emoji: lastSentEmoji })}
            </span>
          ) : (
            <button
              className={styles.quickCheerMore}
              onClick={() => onOpenChange(true)}
            >
              {t('sing.quickCheer.more')}
            </button>
          )}
        </div>
      )}

      <div className={styles.drawerBody}>
        {!loading && (
          <YourTurnCard
            upcoming={upcoming}
            userName={username}
            estimate={estimate}
            sessionEndsAt={sessionEndsAt}
            isPlaying={isPlaying}
          />
        )}

        {showingNowPlaying && reactionsOn ? (
          <CheerBar
            onReaction={onReaction}
            cooldown={reactionCooldown}
            lastSentEmoji={lastSentEmoji}
            disabled={!username.trim()}
            compact
          />
        ) : reactionsOn && queueItems.length > 0 && (
          <div className={styles.cheerHint}>
            {t('sing.cheerHint')}
          </div>
        )}

        <QueuePanel
          items={queueItems}
          estimate={estimate}
          sessionEndsAt={sessionEndsAt}
          viewerName={viewerName}
          loading={loading}
          headerClass={styles.drawerQueueHeader}
          listClass={styles.drawerQueueList}
        />
      </div>
    </div>
  );
};

export default MobileQueueDrawer;
