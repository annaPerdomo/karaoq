import * as React from 'react';
import styles from '../../../styles/Admin.module.css';

export default function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): React.ReactElement {
  return (
    <details className={styles.disclosure} open={defaultOpen}>
      <summary className={styles.disclosureSummary}>{summary}</summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}
