import * as React from 'react';
import styles from '../../styles/Analytics.module.css';

export interface DetailRow {
  title: string;
  badge?: string;
  badgeKind?: 'role' | 'via';
  /** Falsy entries are dropped, so callers can pass conditionals inline. */
  meta: (string | null | undefined | false)[];
}

const DetailRows = ({
  rows,
  empty,
}: {
  rows: DetailRow[];
  empty: string;
}): React.ReactElement => {
  if (rows.length === 0) {
    return <p className={styles.detailEmpty}>{empty}</p>;
  }
  return (
    <ul className={styles.detailList}>
      {rows.map((row, i) => (
        <li key={i} className={styles.detailItem}>
          <div className={styles.detailItemMain}>
            <span className={styles.detailName}>{row.title}</span>
            {row.badge && (
              <span
                className={
                  row.badgeKind === 'role' ? styles.roleBadge : styles.viaBadge
                }
              >
                {row.badge}
              </span>
            )}
          </div>
          <div className={styles.detailItemMeta}>
            {row.meta.filter(Boolean).map((m, j) => (
              <span key={j}>{m}</span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
};

export default DetailRows;
