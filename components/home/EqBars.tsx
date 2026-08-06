import * as React from 'react';
import styles from '../../styles/Home.module.css';

export default function EqBars({ color }: { color: string }) {
  return (
    <div className={styles.eqBars} aria-hidden="true">
      {[0, 0.2, 0.1, 0.3, 0.15].map((d, i) => (
        <span key={i} className={styles.eqBar} style={{ animationDelay: `${d}s`, background: color }} />
      ))}
    </div>
  );
}
