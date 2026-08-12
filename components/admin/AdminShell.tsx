import * as React from 'react';
import styles from '../../styles/Admin.module.css';
import type { AdminView } from './types';
import {
  ErrorsIcon,
  FeedbackIcon,
  PulseIcon,
  RoomsIcon,
  SuggestionsIcon,
} from './icons';

const NAV: { view: AdminView; label: string; icon: React.ComponentType }[] = [
  { view: 'rooms', label: 'Rooms', icon: RoomsIcon },
  { view: 'errors', label: 'Errors', icon: ErrorsIcon },
  { view: 'suggestions', label: 'Suggestions', icon: SuggestionsIcon },
  { view: 'pulse', label: 'Pulse', icon: PulseIcon },
  { view: 'feedback', label: 'Feedback', icon: FeedbackIcon },
];

export default function AdminShell({
  view,
  badges,
  refreshing,
  generatedAt,
  onNavigate,
  onRefresh,
  onLogout,
  children,
}: {
  view: AdminView;
  badges: Partial<Record<AdminView, number>>;
  refreshing: boolean;
  generatedAt: string | null;
  onNavigate: (view: AdminView) => void;
  onRefresh: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandLogo}>KaraoQ</span>
          <span className={styles.brandSub}>Mission Control</span>
        </div>
        <nav className={styles.nav} aria-label="Admin sections">
          {NAV.map(({ view: v, label, icon: NavIcon }) => {
            const badge = badges[v] ?? 0;
            return (
              <button
                key={v}
                className={`${styles.navItem} ${view === v ? styles.navItemActive : ''}`}
                onClick={() => onNavigate(v)}
                aria-current={view === v ? 'page' : undefined}
              >
                <NavIcon />
                <span className={styles.navLabel}>{label}</span>
                {badge > 0 && <span className={styles.navBadge}>{badge}</span>}
              </button>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <button className={styles.refreshBtn} onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className={styles.logoutBtn} onClick={onLogout}>
            Log out
          </button>
          {generatedAt && (
            <span className={styles.generatedAt}>
              Data as of{' '}
              {new Date(generatedAt).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
