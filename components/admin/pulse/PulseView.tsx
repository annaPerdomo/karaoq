import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData } from '../types';
import PulseHeadline from './PulseHeadline';
import PulseActivation from './PulseActivation';
import PulseRhythm from './PulseRhythm';
import PulseAudience from './PulseAudience';
import PulseFeatures from './PulseFeatures';

export default function PulseView({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement {
  const tz = data.meta?.timezone ?? 'UTC';

  return (
    <div className={styles.view}>
      <header className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Pulse</h1>
          <p className={styles.viewSub}>
            Rolling windows end now. &quot;Today&quot; is the calendar day in{' '}
            {tz}.
          </p>
        </div>
      </header>

      <PulseHeadline data={data} />
      <PulseActivation data={data} />
      <PulseRhythm data={data} />
      <PulseAudience data={data} />
      <PulseFeatures data={data} />
    </div>
  );
}
