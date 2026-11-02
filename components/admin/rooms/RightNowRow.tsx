import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RightNow } from '../types';

// Atlas M0's connection ceiling; `live` counts every room doc touched
// recently, including dev's, since both share the one cluster.
const LIVE_WARN_AT = 25;

export default function RightNowRow({
  data,
}: {
  data: RightNow | null;
}): React.ReactElement | null {
  if (!data) return null;
  const { live, created, sang } = data;
  return (
    <p className={styles.rightNowRow}>
      Right now ·{' '}
      <span className={live >= LIVE_WARN_AT ? styles.rightNowWarn : undefined}>
        {live} live rooms
      </span>{' '}
      · {created} created in 2h · {sang} of them sang
    </p>
  );
}
