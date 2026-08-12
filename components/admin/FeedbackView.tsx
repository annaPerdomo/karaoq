import * as React from 'react';
import styles from '../../styles/Admin.module.css';
import { FeedbackPanel } from './FeedbackPanel';

export default function FeedbackView({
  secret,
  onUnhandledChange,
}: {
  secret: string;
  onUnhandledChange: (count: number) => void;
}): React.ReactElement {
  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Feedback</h1>
          <p className={styles.viewSub}>
            What people took the time to tell you.
          </p>
        </div>
      </header>
      <FeedbackPanel secret={secret} onUnhandledChange={onUnhandledChange} />
    </div>
  );
}
