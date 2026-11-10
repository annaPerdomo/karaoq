import * as React from 'react';
import styles from '../../styles/Admin.module.css';
import type { AdminView } from './types';
import { SECONDARY_NAV } from './nav';

export default function MoreView({
  badges,
  generatedAt,
  onNavigate,
  onLogout,
}: {
  badges: Partial<Record<AdminView, number>>;
  generatedAt: string | null;
  onNavigate: (view: AdminView) => void;
  onLogout: () => void;
}): React.ReactElement {
  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>More</h1>
          <p className={styles.viewSub}>The deeper dives, unchanged.</p>
        </div>
      </header>
      <div className={styles.moreList}>
        {SECONDARY_NAV.map(({ view, label, hint, icon: NavIcon }) => {
          const badge = badges[view] ?? 0;
          return (
            <button
              key={view}
              type="button"
              className={styles.moreItem}
              onClick={() => onNavigate(view)}
            >
              <NavIcon />
              <span className={styles.moreItemText}>
                <span className={styles.moreItemLabel}>{label}</span>
                <span className={styles.moreItemHint}>{hint}</span>
              </span>
              {badge > 0 && <span className={styles.navBadge}>{badge}</span>}
            </button>
          );
        })}
      </div>
      <button className={styles.moreLogout} onClick={onLogout}>
        Log out
      </button>
      {generatedAt && (
        <p className={styles.moreAsOf}>
          Data as of{' '}
          {new Date(generatedAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}
