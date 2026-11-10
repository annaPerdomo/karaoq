import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RightNow, RoomRow } from '../types';
import { adminFeature } from '../../../lib/adminFeatures';
import RoomCard from './RoomCard';
import RightNowRow from './RightNowRow';
import RoomsFilters from './RoomsFilters';
import CameBackCard from './CameBackCard';
import RoomsListEnd from './RoomsListEnd';
import { roomsSubtitle } from './roomsSubtitle';
import MergeBanner from './MergeBanner';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/** Search filters server-side, so it reaches rooms past the loaded pages. */
export default function RoomsView({
  secret,
  query,
  feature,
  refreshToken,
  onQueryChange,
  onFeatureChange,
  onMutate,
}: {
  secret: string;
  query: string;
  /** A lib/adminFeatures id. */
  feature: string | null;
  /** Bumped by the shell's Refresh button; any change reloads the first page. */
  refreshToken: number;
  onQueryChange: (q: string) => void;
  onFeatureChange: (feature: string | null) => void;
  /** A delete/merge changed the totals other views show — refetch them. */
  onMutate: () => void;
}): React.ReactElement {
  const [rooms, setRooms] = React.useState<RoomRow[]>([]);
  const [liveOnly, setLiveOnly] = React.useState(false);
  // Counted server-side over every room, not over the loaded pages: a room
  // created days ago can be live now, and newest-first would bury it.
  const [liveCount, setLiveCount] = React.useState(0);
  const [rightNow, setRightNow] = React.useState<RightNow | null>(null);
  // Tagged with its feature so a chip switch can't show the old count mid-request.
  const [featureRooms, setFeatureRooms] = React.useState<{ feature: string; count: number } | null>(null);
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
    async (skip: number, replace: boolean, q: string, live: boolean, feat: string | null) => {
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
        if (feat) params.set('feature', feat);
        const res = await fetch(`/api/analytics/rooms?${params}`, {
          headers: { 'x-analytics-secret': secret },
        });
        if (!res.ok) throw new Error('Failed to load rooms');
        const json = await res.json();
        if (seq !== requestSeq.current) return;
        setRooms((prev) => (replace ? json.rooms : [...prev, ...json.rooms]));
        setHasMore(Boolean(json.hasMore));
        setLiveCount(json.liveCount ?? 0);
        setRightNow(json.rightNow ?? null);
        setFeatureRooms(
          feat && typeof json.featureRooms === 'number' ? { feature: feat, count: json.featureRooms } : null
        );
      } catch {
        if (seq !== requestSeq.current) return;
        setHasMore(false);
        setFailed(true);
      }
      if (seq === requestSeq.current) setLoading(false);
    },
    [secret]
  );

  const sendCheer = React.useCallback(
    async (roomId: string, emoji: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/analytics/cheer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-analytics-secret': secret },
          body: JSON.stringify({ roomId, emoji }),
        });
        // 409: nothing is playing any more, so the card's buttons are stale.
        if (res.status === 409) loadRooms(0, true, query, liveOnly, feature);
        return res.ok;
      } catch {
        return false;
      }
    },
    [secret, loadRooms, query, liveOnly, feature]
  );

  React.useEffect(() => {
    const timer = setTimeout(
      () => loadRooms(0, true, query, liveOnly, feature),
      query ? SEARCH_DEBOUNCE_MS : 0
    );
    return () => clearTimeout(timer);
  }, [query, liveOnly, feature, refreshToken, loadRooms]);

  React.useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting)
          loadRooms(rooms.length, false, query, liveOnly, feature);
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, rooms.length, query, liveOnly, feature, loadRooms]);

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
      loadRooms(0, true, query, liveOnly, feature);
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
      loadRooms(0, true, query, liveOnly, feature);
      onMutate();
    } catch {
      alert('Failed to merge rooms');
    }
  }

  const featureLabel = adminFeature(feature)?.label ?? null;
  const filtered = liveOnly || feature !== null;

  function openRoom(roomId: string) {
    setLiveOnly(false);
    onFeatureChange(null);
    onQueryChange(roomId);
  }

  function emptyMessage(): string {
    if (loading) return 'Loading…';
    if (failed) return 'Couldn’t load rooms.';
    if (featureLabel)
      return `No ${liveOnly ? 'live ' : ''}rooms${query ? ` matching “${query}”` : ''} have used ${featureLabel}.`;
    if (liveOnly && query) return `No live rooms matching “${query}”`;
    if (liveOnly) return 'No rooms are live right now.';
    if (query) return `No rooms matching “${query}”`;
    return 'No rooms created yet';
  }

  return (
    <div className={styles.view}>
      <RightNowRow data={rightNow} />
      <CameBackCard
        secret={secret}
        refreshToken={refreshToken}
        hidden={Boolean(query) || filtered}
        onOpenRoom={openRoom}
      />
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Rooms</h1>
          <p className={styles.viewSub}>
            {roomsSubtitle(
              featureLabel,
              featureRooms?.feature === feature ? featureRooms.count : null,
              liveOnly
            )}
          </p>
        </div>
      </header>
      <RoomsFilters
        query={query}
        liveOnly={liveOnly}
        liveCount={liveCount}
        feature={feature}
        onQueryChange={onQueryChange}
        onLiveChange={setLiveOnly}
        onFeatureChange={onFeatureChange}
      />

      {mergeSource && (
        <MergeBanner source={mergeSource} onCancel={() => setMergeSource(null)} />
      )}

      {rooms.length === 0 ? (
        <p className={styles.empty}>
          {emptyMessage()}
          {failed && (
            <button
              className={styles.retryBtn}
              onClick={() => loadRooms(0, true, query, liveOnly, feature)}
            >
              Retry
            </button>
          )}
          {filtered && !loading && !failed && (
            <button
              className={styles.retryBtn}
              onClick={() => {
                setLiveOnly(false);
                onFeatureChange(null);
              }}
            >
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
                highlight={feature}
                secret={secret}
                expanded={expanded === room.roomId}
                merging={mergeSource === room.roomId}
                mergeArmed={mergeSource !== null}
                onToggle={() =>
                  setExpanded((cur) => (cur === room.roomId ? null : room.roomId))
                }
                onMerge={() => handleMergeClick(room.roomId)}
                onDelete={() => handleDelete(room.roomId)}
                onCheer={(emoji) => sendCheer(room.roomId, emoji)}
              />
            ))}
          </div>
          <div ref={sentinelRef} />
          <RoomsListEnd
            count={rooms.length}
            liveOnly={liveOnly}
            loading={loading}
            failed={failed}
            hasMore={hasMore}
            onRetry={() => loadRooms(rooms.length, false, query, liveOnly, feature)}
          />
        </>
      )}
    </div>
  );
}
