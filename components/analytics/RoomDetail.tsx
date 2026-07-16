import * as React from 'react';
import styles from '../../styles/Analytics.module.css';

interface Person {
  userName: string | null;
  role: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  country: string | null;
  city: string | null;
}

interface SongRow {
  userName: string | null;
  songTitle: string | null;
  videoId: string | null;
  via: string;
  timestamp: string;
}

interface RequestRow {
  userName: string | null;
  songTitle: string | null;
  videoId: string | null;
  timestamp: string;
}

interface SingWithMeRow {
  kind: 'posted' | 'joined' | 'queued';
  userName: string | null;
  songTitle: string | null;
  videoId: string | null;
  timestamp: string;
}

interface RoomDetailData {
  roomId: string;
  people: Person[];
  songs: SongRow[];
  requests: RequestRow[];
  singWithMe: SingWithMeRow[];
  counts: {
    people: number;
    songs: number;
    requests: number;
    singWithMe: number;
    reactions: number;
    searches: number;
  };
}

type Tab = 'people' | 'songs' | 'requests' | 'singWithMe';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const VIA_LABELS: Record<string, string> = {
  search: 'Search',
  board_claim: 'Request',
  singwithme: 'Sing With Me',
};

const SWM_LABELS: Record<string, string> = {
  posted: 'Posted',
  joined: 'Joined',
  queued: 'Queued',
};

function locationLabel(p: Person): string {
  if (p.city) return `${safeDecode(p.city)}, ${p.country ?? ''}`.replace(/, $/, '');
  return p.country || '';
}

const RoomDetail = ({
  roomId,
  secret,
  onClose,
}: {
  roomId: string;
  secret: string;
  onClose: () => void;
}): React.ReactElement => {
  const [data, setData] = React.useState<RoomDetailData | null>(null);
  const [error, setError] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>('people');

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    fetch(`/api/analytics/room?roomId=${encodeURIComponent(roomId)}`, {
      headers: { 'x-analytics-secret': secret },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load room');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, secret]);

  // Close on Escape for keyboard users.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const c = data?.counts;

  return (
    <div className={styles.detailOverlay} onClick={onClose}>
      <div
        className={styles.detailModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Room ${roomId} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>{roomId}</h2>
          <div className={styles.detailHeaderActions}>
            <a
              className={styles.detailOpenBtn}
              href={`/host/${roomId}?admin=1`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the room without being counted as a participant"
            >
              Open as admin ↗
            </a>
            <button className={styles.detailClose} onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        </div>

        {error ? (
          <p className={styles.detailEmpty}>Couldn&rsquo;t load room details.</p>
        ) : !data ? (
          <p className={styles.detailEmpty}>Loading…</p>
        ) : (
          <>
            <div className={styles.detailTabs}>
              <button
                className={`${styles.detailTab} ${tab === 'people' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('people')}
              >
                People {c ? `(${c.people})` : ''}
              </button>
              <button
                className={`${styles.detailTab} ${tab === 'songs' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('songs')}
              >
                Songs {c ? `(${c.songs})` : ''}
              </button>
              <button
                className={`${styles.detailTab} ${tab === 'requests' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('requests')}
              >
                Requests {c ? `(${c.requests})` : ''}
              </button>
              <button
                className={`${styles.detailTab} ${tab === 'singWithMe' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('singWithMe')}
              >
                Sing With Me {c ? `(${c.singWithMe})` : ''}
              </button>
            </div>

            <div className={styles.detailBody}>
              {tab === 'people' && (
                data.people.length === 0 ? (
                  <p className={styles.detailEmpty}>No one joined this room.</p>
                ) : (
                  <ul className={styles.detailList}>
                    {data.people.map((p, i) => (
                      <li key={i} className={styles.detailItem}>
                        <div className={styles.detailItemMain}>
                          <span className={styles.detailName}>{p.userName || 'Anonymous'}</span>
                          {p.role && <span className={styles.roleBadge}>{p.role}</span>}
                        </div>
                        <div className={styles.detailItemMeta}>
                          {locationLabel(p) && <span>{locationLabel(p)}</span>}
                          <span>{formatTime(p.firstSeen)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {tab === 'songs' && (
                data.songs.length === 0 ? (
                  <p className={styles.detailEmpty}>No songs added.</p>
                ) : (
                  <ul className={styles.detailList}>
                    {data.songs.map((s, i) => (
                      <li key={i} className={styles.detailItem}>
                        <div className={styles.detailItemMain}>
                          <span className={styles.detailName}>{s.songTitle || 'Untitled'}</span>
                          <span className={styles.viaBadge}>{VIA_LABELS[s.via] || s.via}</span>
                        </div>
                        <div className={styles.detailItemMeta}>
                          <span>{s.userName || 'Anonymous'}</span>
                          <span>{formatTime(s.timestamp)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {tab === 'requests' && (
                data.requests.length === 0 ? (
                  <p className={styles.detailEmpty}>No requests posted.</p>
                ) : (
                  <ul className={styles.detailList}>
                    {data.requests.map((r, i) => (
                      <li key={i} className={styles.detailItem}>
                        <div className={styles.detailItemMain}>
                          <span className={styles.detailName}>{r.songTitle || 'Untitled'}</span>
                        </div>
                        <div className={styles.detailItemMeta}>
                          <span>{r.userName || 'Anonymous'}</span>
                          <span>{formatTime(r.timestamp)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {tab === 'singWithMe' && (
                data.singWithMe.length === 0 ? (
                  <p className={styles.detailEmpty}>No sing-with-me activity.</p>
                ) : (
                  <ul className={styles.detailList}>
                    {data.singWithMe.map((s, i) => (
                      <li key={i} className={styles.detailItem}>
                        <div className={styles.detailItemMain}>
                          <span className={styles.detailName}>{s.songTitle || 'Untitled'}</span>
                          <span className={styles.viaBadge}>{SWM_LABELS[s.kind] || s.kind}</span>
                        </div>
                        <div className={styles.detailItemMeta}>
                          <span>{s.userName || 'Anonymous'}</span>
                          <span>{formatTime(s.timestamp)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

            {c && (
              <div className={styles.detailFooter}>
                {c.reactions} reactions · {c.searches} searches
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RoomDetail;
