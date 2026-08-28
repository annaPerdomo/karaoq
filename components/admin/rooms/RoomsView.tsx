import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomRow } from '../types';
import { LIVE_EXPLANATION } from '../format';
import RoomCard from './RoomCard';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const LIVE_TIP_ID = 'rooms-live-tip';

/** Search filters server-side, so it reaches rooms past the loaded pages. */
export default function RoomsView({
  secret,
  query,
  refreshToken,
  onQueryChange,
  onMutate,
}: {
  secret: string;
  query: string;
  /** Bumped by the shell's Refresh button; any change reloads the first page. */
  refreshToken: number;
  onQueryChange: (q: string) => void;
  /** A delete/merge changed the totals other views show — refetch them. */
  onMutate: () => void;
}): React.ReactElement {
  const [rooms, setRooms] = React.useState<RoomRow[]>([]);
  const [liveOnly, setLiveOnly] = React.useState(false);
  // Counted server-side over every room, not over the loaded pages: a room
  // created days ago can be live now, and newest-first would bury it.
  const [liveCount, setLiveCount] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [mergeSource, setMergeSource] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  // The debounce cancels the timer, not a request already in flight: without a
  // sequence guard, a slow "AB" response can land after "ABC" and leave the
  // list showing results for a query the operator has moved past.
  const requestSeq = React.useRef(0);

  const loadRooms = React.useCallback(
    async (skip: number, replace: boolean, q: string, live: boolean) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({
          skip: String(skip),
          limit: String(PAGE_SIZE),
        });
        if (q) params.set('q', q);
        if (live) params.set('live', '1');
        const res = await fetch(`/api/analytics/rooms?${params}`, {
          headers: { 'x-analytics-secret': secret },
        });
        if (!res.ok) throw new Error('Failed to load rooms');
        const json = await res.json();
        if (seq !== requestSeq.current) return;
        setRooms((prev) => (replace ? json.rooms : [...prev, ...json.rooms]));
        setHasMore(Boolean(json.hasMore));
        setLiveCount(json.liveCount ?? 0);
      } catch {
        if (seq !== requestSeq.current) return;
        setHasMore(false);
        setFailed(true);
      }
      if (seq === requestSeq.current) setLoading(false);
    },
    [secret]
  );

  React.useEffect(() => {
    const timer = setTimeout(
      () => loadRooms(0, true, query, liveOnly),
      query ? SEARCH_DEBOUNCE_MS : 0
    );
    return () => clearTimeout(timer);
  }, [query, liveOnly, refreshToken, loadRooms]);

  React.useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting)
          loadRooms(rooms.length, false, query, liveOnly);
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, rooms.length, query, liveOnly, loadRooms]);

  async function handleDelete(roomId: string) {
    if (!confirm(`Delete all data for room ${roomId}?`)) return;
    try {
      const res = await fetch(`/api/analytics/room?roomId=${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
        headers: { 'x-analytics-secret': secret },
      });
      if (!res.ok) throw new Error('Delete failed');
      if (mergeSource === roomId) setMergeSource(null);
      if (expanded === roomId) setExpanded(null);
      loadRooms(0, true, query, liveOnly);
      onMutate();
    } catch {
      alert('Failed to delete room');
    }
  }

  function handleMergeClick(roomId: string) {
    if (mergeSource === null) {
      setMergeSource(roomId);
      return;
    }
    if (mergeSource === roomId) {
      setMergeSource(null);
      return;
    }
    const source = mergeSource;
    if (
      !confirm(
        `Merge ${source} into ${roomId}? All of ${source}'s songs and people move into ${roomId}, and ${source} is removed.`
      )
    )
      return;
    handleMerge(source, roomId);
  }

  async function handleMerge(source: string, target: string) {
    try {
      const res = await fetch('/api/analytics/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-analytics-secret': secret },
        body: JSON.stringify({ source, target }),
      });
      if (!res.ok) throw new Error('Merge failed');
      setMergeSource(null);
      loadRooms(0, true, query, liveOnly);
      onMutate();
    } catch {
      alert('Failed to merge rooms');
    }
  }

  function emptyMessage(): string {
    if (loading) return 'Loading…';
    if (failed) return 'Couldn’t load rooms.';
    if (liveOnly && query) return `No live rooms matching “${query}”`;
    if (liveOnly) return 'No rooms are live right now.';
    if (query) return `No rooms matching “${query}”`;
    return 'No rooms created yet';
  }

  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Rooms</h1>
          <p className={styles.viewSub}>
            {liveOnly
              ? 'Live rooms only — click one for the whole story.'
              : 'Every room, newest first — click one for the whole story.'}
          </p>
        </div>
        <div className={styles.roomsTools}>
          {/* Kept mounted while filtering even at zero, so the last room going
              dormant can't strand the operator in an empty filtered list. */}
          {(liveCount > 0 || liveOnly) && (
            <span className={styles.liveToggleWrap}>
              <button
                type="button"
                className={`${styles.liveToggle} ${
                  liveOnly ? styles.liveToggleOn : ''
                }`}
                onClick={() => setLiveOnly((on) => !on)}
                aria-pressed={liveOnly}
                aria-describedby={LIVE_TIP_ID}
              >
                ● {liveCount} live now
              </button>
              <span role="tooltip" id={LIVE_TIP_ID} className={styles.liveTip}>
                {LIVE_EXPLANATION}
              </span>
            </span>
          )}
          <input
            type="search"
            className={styles.roomSearch}
            placeholder="Find a room code…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search rooms by code"
          />
        </div>
      </header>

      {mergeSource && (
        <div className={styles.mergeBanner}>
          <span>
            Merging <strong>{mergeSource}</strong> — pick the room to fold it into.
          </span>
          <button className={styles.mergeCancel} onClick={() => setMergeSource(null)}>
            Cancel
          </button>
        </div>
      )}

      {rooms.length === 0 ? (
        <p className={styles.empty}>
          {emptyMessage()}
          {failed && (
            <button
              className={styles.retryBtn}
              onClick={() => loadRooms(0, true, query, liveOnly)}
            >
              Retry
            </button>
          )}
          {liveOnly && !loading && !failed && (
            <button className={styles.retryBtn} onClick={() => setLiveOnly(false)}>
              Show all rooms
            </button>
          )}
        </p>
      ) : (
        <>
          <div className={styles.roomList}>
            {rooms.map((room, i) => (
              <RoomCard
                key={`${room.roomId}-${i}`}
                room={room}
                secret={secret}
                expanded={expanded === room.roomId}
                merging={mergeSource === room.roomId}
                mergeArmed={mergeSource !== null}
                onToggle={() =>
                  setExpanded((cur) => (cur === room.roomId ? null : room.roomId))
                }
                onMerge={() => handleMergeClick(room.roomId)}
                onDelete={() => handleDelete(room.roomId)}
              />
            ))}
          </div>
          <div ref={sentinelRef} />
          {loading && <p className={styles.empty}>Loading…</p>}
          {failed && !loading ? (
            <p className={styles.empty}>
              Couldn&rsquo;t load more rooms.{' '}
              <button
                className={styles.retryBtn}
                onClick={() => loadRooms(rooms.length, false, query, liveOnly)}
              >
                Retry
              </button>
            </p>
          ) : (
            !hasMore && !loading && (
              <p className={styles.roomsEnd}>
                {rooms.length} {liveOnly ? 'live rooms' : 'rooms'}
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
