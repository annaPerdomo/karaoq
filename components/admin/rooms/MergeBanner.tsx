import * as React from 'react';
import styles from '../../../styles/Admin.module.css';

export default function MergeBanner({
  source,
  onCancel,
}: {
  source: string;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div className={styles.mergeBanner}>
      <span>
        Merging <strong>{source}</strong> — pick the room to fold it into.
      </span>
      <button className={styles.mergeCancel} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
