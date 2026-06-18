import * as React from 'react';
import styles from '../styles/Analytics.module.css';

interface AnalyticsData {
  overview: {
    totalRooms: number;
    roomsToday: number;
    roomsThisWeek: number;
    totalSongs: number;
    totalReactions: number;
    uniqueUsers: number;
    avgSessionMinutes: number;
    maxSessionMinutes: number;
    totalSessions: number;
    hostSessions: number;
    singerSessions: number;
    avgSongsPerRoom: number;
    maxSongsPerRoom: number;
    totalQrPrints: number;
  };
  charts: {
    roomsByDay: { _id: string; count: number }[];
    songsByDay: { _id: string; count: number }[];
    hourlyActivity: { _id: number; count: number }[];
    qrPrintsByDay: { _id: string; count: number }[];
  };
  geo: {
    countries: { _id: string; count: number }[];
    cities: { _id: { city: string; country: string; region: string }; count: number }[];
  };
  rankings: {
    topSongs: { _id: { title: string; videoId: string }; count: number }[];
    topUsers: { _id: string; count: number }[];
  };
  devices: { _id: string; count: number }[];
  suggestions: {
    total: number;
    bySource: { _id: string; count: number }[];
    bySection: { _id: string; count: number }[];
    byCategory: { _id: string; count: number }[];
    topSongs: { _id: { title: string; artist: string }; count: number }[];
    byDay: { _id: string; count: number }[];
  };
}

interface RoomRow {
  roomId: string;
  timestamp: string;
  country?: string;
  city?: string;
  songs: number;
  participants: number;
}

const ROOMS_PAGE_SIZE = 25;

function BarChart({ data, color = '#a78bfa' }: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0) return <p className={styles.empty}>No data yet</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={styles.barChart}>
      {data.map((d, i) => (
        <div key={i} className={styles.barRow}>
          <span className={styles.barLabel}>{d.label}</span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className={styles.barValue}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

const Analytics = (): React.ReactElement => {
  const [secret, setSecret] = React.useState('');
  const [authenticated, setAuthenticated] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'geo' | 'songs' | 'suggestions' | 'rooms'>('overview');
  const [rooms, setRooms] = React.useState<RoomRow[]>([]);
  const [roomsHasMore, setRoomsHasMore] = React.useState(false);
  const [roomsLoading, setRoomsLoading] = React.useState(false);
  const [roomsLoaded, setRoomsLoaded] = React.useState(false);
  const [roomsError, setRoomsError] = React.useState(false);
  const [mergeSource, setMergeSource] = React.useState<string | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const fetchData = React.useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/data', {
        headers: { 'x-analytics-secret': s },
      });
      if (res.status === 401) {
        setError('Invalid secret');
        setAuthenticated(false);
        localStorage.removeItem('karaoq_analytics_secret');
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error('Failed to load analytics');
      const json = await res.json();
      setData(json);
      setAuthenticated(true);
      localStorage.setItem('karaoq_analytics_secret', s);
    } catch {
      setError('Failed to load analytics data');
    }
    setLoading(false);
  }, []);

  const loadRooms = React.useCallback(
    async (skip: number, replace: boolean) => {
      setRoomsLoading(true);
      setRoomsError(false);
      try {
        const res = await fetch(`/api/analytics/rooms?skip=${skip}&limit=${ROOMS_PAGE_SIZE}`, {
          headers: { 'x-analytics-secret': secret },
        });
        if (!res.ok) throw new Error('Failed to load rooms');
        const json = await res.json();
        setRooms((prev) => (replace ? json.rooms : [...prev, ...json.rooms]));
        setRoomsHasMore(Boolean(json.hasMore));
      } catch {
        setRoomsHasMore(false);
        setRoomsError(true);
      }
      // Mark as loaded even on failure so the auto-load effect doesn't retry in
      // a loop; the error state offers a manual retry instead.
      setRoomsLoaded(true);
      setRoomsLoading(false);
    },
    [secret]
  );

  React.useEffect(() => {
    const saved = localStorage.getItem('karaoq_analytics_secret');
    if (saved) {
      setSecret(saved);
      fetchData(saved);
    }
  }, [fetchData]);

  // Load the first page of rooms the first time the Rooms tab is opened.
  React.useEffect(() => {
    if (activeTab === 'rooms' && authenticated && !roomsLoaded && !roomsLoading) {
      loadRooms(0, true);
    }
  }, [activeTab, authenticated, roomsLoaded, roomsLoading, loadRooms]);

  // Infinite scroll: load the next page when the sentinel enters view.
  React.useEffect(() => {
    if (activeTab !== 'rooms' || !roomsHasMore || roomsLoading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadRooms(rooms.length, false);
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, roomsHasMore, roomsLoading, rooms.length, loadRooms]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!secret.trim()) return;
    fetchData(secret.trim());
  }

  function handleLogout() {
    localStorage.removeItem('karaoq_analytics_secret');
    setAuthenticated(false);
    setData(null);
    setSecret('');
    setRooms([]);
    setRoomsLoaded(false);
    setRoomsError(false);
    setMergeSource(null);
  }

  async function handleDeleteRoom(roomId: string) {
    if (!confirm(`Delete all data for room ${roomId}?`)) return;
    try {
      const res = await fetch(`/api/analytics/room?roomId=${roomId}`, {
        method: 'DELETE',
        headers: { 'x-analytics-secret': secret },
      });
      if (!res.ok) throw new Error('Delete failed');
      if (mergeSource === roomId) setMergeSource(null);
      loadRooms(0, true);
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
      loadRooms(0, true);
    } catch {
      alert('Failed to merge rooms');
    }
  }

  if (!authenticated) {
    return (
      <main className={styles.main}>
        <div className={styles.loginCard}>
          <h1 className={styles.loginTitle}>KaraoQ Analytics</h1>
          <form onSubmit={handleLogin} className={styles.loginForm}>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Enter analytics secret"
              className={styles.loginInput}
              autoFocus
            />
            <button type="submit" className={styles.loginButton} disabled={loading}>
              {loading ? 'Loading...' : 'View Analytics'}
            </button>
          </form>
          {error && <p className={styles.loginError}>{error}</p>}
        </div>
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}><div className={styles.spinner} /></div>
      </main>
    );
  }

  const { overview, charts, geo, rankings, devices, suggestions } = data;

  const mobileCount = devices.find((d) => d._id === 'Mobile')?.count || 0;
  const desktopCount = devices.find((d) => d._id === 'Desktop')?.count || 0;
  const totalDevices = mobileCount + desktopCount;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>KaraoQ Analytics</h1>
        <div className={styles.headerActions}>
          <button onClick={() => fetchData(secret)} className={styles.refreshBtn}>Refresh</button>
          <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
        </div>
      </header>

      <nav className={styles.tabs}>
        {(['overview', 'geo', 'songs', 'suggestions', 'rooms'] as const).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <div className={styles.tabContent}>
          <div className={styles.statGrid}>
            <StatCard label="Total Rooms" value={overview.totalRooms} />
            <StatCard label="Rooms Today" value={overview.roomsToday} />
            <StatCard label="Rooms This Week" value={overview.roomsThisWeek} />
            <StatCard label="Total Songs Queued" value={overview.totalSongs} />
            <StatCard label="Total Reactions" value={overview.totalReactions} />
            <StatCard label="QR Prints" value={overview.totalQrPrints} />
            <StatCard label="Unique Singers" value={overview.uniqueUsers} />
            <StatCard
              label="Avg Session"
              value={`${overview.avgSessionMinutes}m`}
              sub={`Max: ${overview.maxSessionMinutes}m`}
            />
            <StatCard
              label="Avg Songs/Room"
              value={overview.avgSongsPerRoom}
              sub={`Max: ${overview.maxSongsPerRoom}`}
            />
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Rooms Created (Last 30 Days)</h2>
            <BarChart
              data={charts.roomsByDay.map((d) => ({ label: formatDate(d._id), value: d.count }))}
              color="#a78bfa"
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Songs Added (Last 30 Days)</h2>
            <BarChart
              data={charts.songsByDay.map((d) => ({ label: formatDate(d._id), value: d.count }))}
              color="#f472b6"
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>QR Prints (Last 30 Days)</h2>
            <BarChart
              data={charts.qrPrintsByDay.map((d) => ({ label: formatDate(d._id), value: d.count }))}
              color="#fbbf24"
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Peak Hours (UTC)</h2>
            <BarChart
              data={charts.hourlyActivity.map((d) => ({ label: formatHour(d._id), value: d.count }))}
              color="#34d399"
            />
          </section>

          {totalDevices > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Devices</h2>
              <div className={styles.deviceBar}>
                <div
                  className={styles.deviceMobile}
                  style={{ width: `${(mobileCount / totalDevices) * 100}%` }}
                >
                  Mobile {Math.round((mobileCount / totalDevices) * 100)}%
                </div>
                <div
                  className={styles.deviceDesktop}
                  style={{ width: `${(desktopCount / totalDevices) * 100}%` }}
                >
                  Desktop {Math.round((desktopCount / totalDevices) * 100)}%
                </div>
              </div>
            </section>
          )}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Sessions</h2>
            <div className={styles.sessionStats}>
              <span>Total: {overview.totalSessions}</span>
              <span>Hosts: {overview.hostSessions}</span>
              <span>Singers: {overview.singerSessions}</span>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'geo' && (
        <div className={styles.tabContent}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Top Countries</h2>
            <BarChart
              data={geo.countries.map((d) => ({ label: d._id, value: d.count }))}
              color="#60a5fa"
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Top Cities</h2>
            <BarChart
              data={geo.cities.map((d) => ({
                label: `${decodeURIComponent(d._id.city)}, ${decodeURIComponent(d._id.region || d._id.country)}`,
                value: d.count,
              }))}
              color="#f59e0b"
            />
          </section>
        </div>
      )}

      {activeTab === 'songs' && (
        <div className={styles.tabContent}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Most Queued Songs</h2>
            {rankings.topSongs.length === 0 ? (
              <p className={styles.empty}>No songs queued yet</p>
            ) : (
              <div className={styles.songList}>
                {rankings.topSongs.map((s, i) => (
                  <div key={i} className={styles.songRow}>
                    <span className={styles.songRank}>#{i + 1}</span>
                    <div className={styles.songInfo}>
                      <span className={styles.songTitle}>{s._id.title}</span>
                      <a
                        href={`https://youtube.com/watch?v=${s._id.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.songLink}
                      >
                        Watch
                      </a>
                    </div>
                    <span className={styles.songCount}>{s.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Top Singers</h2>
            <BarChart
              data={rankings.topUsers.map((u) => ({ label: u._id, value: u.count }))}
              color="#c084fc"
            />
          </section>
        </div>
      )}

      {activeTab === 'suggestions' && (
        <div className={styles.tabContent}>
          <div className={styles.statGrid}>
            <StatCard label="Total Suggestion Uses" value={suggestions.total} />
            {suggestions.bySource.map((s) => (
              <StatCard
                key={s._id}
                label={
                  s._id === 'random' ? 'Random Button' :
                  s._id === 'song_pick' ? 'Song Picks' :
                  'Genre Chips'
                }
                value={s.count}
                sub={suggestions.total > 0 ? `${Math.round((s.count / suggestions.total) * 100)}% of total` : undefined}
              />
            ))}
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Suggestion Uses (Last 30 Days)</h2>
            <BarChart
              data={suggestions.byDay.map((d) => ({ label: formatDate(d._id), value: d.count }))}
              color="#34d399"
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>By Section</h2>
            <BarChart
              data={suggestions.bySection.map((d) => ({
                label: d._id === 'genre' ? 'Genre' :
                       d._id === 'voice-type' ? 'Voice Type' :
                       d._id === 'spanish' ? 'Spanish' :
                       d._id === 'kpop' ? 'K-Pop' :
                       d._id === 'japanese' ? 'Japanese' :
                       d._id,
                value: d.count,
              }))}
              color="#60a5fa"
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Top Categories</h2>
            <BarChart
              data={suggestions.byCategory.map((d) => ({ label: d._id, value: d.count }))}
              color="#f59e0b"
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Most Clicked Song Suggestions</h2>
            {suggestions.topSongs.length === 0 ? (
              <p className={styles.empty}>No song suggestions clicked yet</p>
            ) : (
              <div className={styles.songList}>
                {suggestions.topSongs.map((s, i) => (
                  <div key={i} className={styles.songRow}>
                    <span className={styles.songRank}>#{i + 1}</span>
                    <div className={styles.songInfo}>
                      <span className={styles.songTitle}>{s._id.title}</span>
                      <span className={styles.songLink}>{s._id.artist}</span>
                    </div>
                    <span className={styles.songCount}>{s.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'rooms' && (
        <div className={styles.tabContent}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Rooms</h2>
            {mergeSource && (
              <div className={styles.mergeBanner}>
                <span>
                  Merging <strong>{mergeSource}</strong> — click another room&rsquo;s merge
                  button to fold it in.
                </span>
                <button className={styles.mergeCancel} onClick={() => setMergeSource(null)}>
                  Cancel
                </button>
              </div>
            )}
            {rooms.length === 0 ? (
              roomsLoading ? (
                <p className={styles.empty}>Loading…</p>
              ) : roomsError ? (
                <p className={styles.empty}>
                  Couldn&rsquo;t load rooms.{' '}
                  <button className={styles.retryBtn} onClick={() => loadRooms(0, true)}>
                    Retry
                  </button>
                </p>
              ) : (
                <p className={styles.empty}>No rooms created yet</p>
              )
            ) : (
              <>
                <div className={styles.roomTable}>
                  <div className={styles.roomHeader}>
                    <span>Code</span>
                    <span>Created</span>
                    <span>Location</span>
                    <span>Songs</span>
                    <span>People</span>
                    <span></span>
                  </div>
                  {rooms.map((r, i) => (
                    <div
                      key={`${r.roomId}-${i}`}
                      className={`${styles.roomRow} ${mergeSource === r.roomId ? styles.roomRowMerging : ''}`}
                    >
                      <a
                        className={styles.roomCode}
                        href={`/host/${r.roomId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.roomId}
                      </a>
                      <span>{formatTimestamp(r.timestamp)}</span>
                      <span>{r.city ? `${decodeURIComponent(r.city)}, ${r.country}` : r.country || '—'}</span>
                      <span>{r.songs}</span>
                      <span>{r.participants}</span>
                      <div className={styles.roomActions}>
                        <button
                          className={`${styles.mergeBtn} ${mergeSource === r.roomId ? styles.mergeBtnActive : ''}`}
                          onClick={() => handleMergeClick(r.roomId)}
                          title={
                            mergeSource === null
                              ? 'Merge this room into another'
                              : mergeSource === r.roomId
                                ? 'Cancel merge'
                                : `Merge ${mergeSource} into ${r.roomId}`
                          }
                        >
                          ⧉
                        </button>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteRoom(r.roomId)}
                          title="Delete room data"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div ref={sentinelRef} />
                {roomsLoading && <p className={styles.empty}>Loading…</p>}
                {!roomsHasMore && !roomsLoading && (
                  <p className={styles.roomsEnd}>{rooms.length} rooms total</p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
};

export default Analytics;
