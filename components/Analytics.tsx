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
  };
  charts: {
    roomsByDay: { _id: string; count: number }[];
    songsByDay: { _id: string; count: number }[];
    hourlyActivity: { _id: number; count: number }[];
  };
  geo: {
    countries: { _id: string; count: number }[];
    cities: { _id: { city: string; country: string; region: string }; count: number }[];
  };
  rankings: {
    topSongs: { _id: { title: string; videoId: string }; count: number }[];
    topUsers: { _id: string; count: number }[];
  };
  recentRooms: {
    roomId: string;
    timestamp: string;
    country?: string;
    city?: string;
    songs: number;
    participants: number;
  }[];
  devices: { _id: string; count: number }[];
}

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
  const [activeTab, setActiveTab] = React.useState<'overview' | 'geo' | 'songs' | 'rooms'>('overview');

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

  React.useEffect(() => {
    const saved = localStorage.getItem('karaoq_analytics_secret');
    if (saved) {
      setSecret(saved);
      fetchData(saved);
    }
  }, [fetchData]);

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

  const { overview, charts, geo, rankings, recentRooms, devices } = data;

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
        {(['overview', 'geo', 'songs', 'rooms'] as const).map((tab) => (
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
                label: `${d._id.city}, ${d._id.region || d._id.country}`,
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

      {activeTab === 'rooms' && (
        <div className={styles.tabContent}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent Rooms</h2>
            {recentRooms.length === 0 ? (
              <p className={styles.empty}>No rooms created yet</p>
            ) : (
              <div className={styles.roomTable}>
                <div className={styles.roomHeader}>
                  <span>Code</span>
                  <span>Created</span>
                  <span>Location</span>
                  <span>Songs</span>
                  <span>People</span>
                </div>
                {recentRooms.map((r, i) => (
                  <div key={i} className={styles.roomRow}>
                    <span className={styles.roomCode}>{r.roomId}</span>
                    <span>{formatTimestamp(r.timestamp)}</span>
                    <span>{r.city ? `${r.city}, ${r.country}` : r.country || '—'}</span>
                    <span>{r.songs}</span>
                    <span>{r.participants}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
};

export default Analytics;
