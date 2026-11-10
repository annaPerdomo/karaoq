import * as React from 'react';
import styles from '../../styles/Admin.module.css';
import type { AdminView } from './types';
import { MoreIcon } from './icons';
import { PRIMARY_NAV, SECONDARY_NAV, isSecondary, type NavEntry } from './nav';

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
  const sidebarItem = ({ view: v, label, icon: NavIcon }: NavEntry) => {
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
  };

  const moreActive = view === 'more' || isSecondary(view);
  const moreBadge = SECONDARY_NAV.reduce((sum, entry) => sum + (badges[entry.view] ?? 0), 0);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandLogo}>KaraoQ</span>
          <span className={styles.brandSub}>Mission Control</span>
        </div>
        <nav className={styles.nav} aria-label="Admin sections">
          {PRIMARY_NAV.map(sidebarItem)}
          <span className={styles.navDivider}>More</span>
          {SECONDARY_NAV.map(sidebarItem)}
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
      <nav className={styles.tabBar} aria-label="Admin tabs">
        {PRIMARY_NAV.map(({ view: v, label, icon: NavIcon }) => {
          const badge = badges[v] ?? 0;
          return (
            <button
              key={v}
              className={`${styles.tab} ${view === v ? styles.tabActive : ''}`}
              onClick={() => onNavigate(v)}
              aria-current={view === v ? 'page' : undefined}
            >
              <NavIcon />
              <span>{label}</span>
              {badge > 0 && <span className={styles.tabBadge}>{badge}</span>}
            </button>
          );
        })}
        <button
          className={`${styles.tab} ${moreActive ? styles.tabActive : ''}`}
          onClick={() => onNavigate('more')}
          aria-current={moreActive ? 'page' : undefined}
        >
          <MoreIcon />
          <span>More</span>
          {moreBadge > 0 && <span className={styles.tabBadge}>{moreBadge}</span>}
        </button>
      </nav>
    </div>
  );
}
