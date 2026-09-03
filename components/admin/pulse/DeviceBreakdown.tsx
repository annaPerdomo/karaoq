import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData } from '../types';
import { pct } from '../format';
import BarList from '../charts/BarList';
import { SERIES } from '../charts/palette';

/** A present-but-tiny slice must not read as absent: 3 of 709 is "<1%", not
 *  "0%" sitting next to a segment the eye can clearly see. */
function share(part: number, whole: number): string {
  if (part === 0) return '0%';
  const rounded = pct(part, whole);
  return rounded === 0 ? '<1%' : `${rounded}%`;
}

const ROLE_LABELS: Record<string, { title: string; note: string }> = {
  host: { title: 'Hosting', note: 'running the room' },
  singer: { title: 'Joining', note: 'singers on their own devices' },
  display: { title: 'Displaying', note: 'the big screen' },
};

const DEVICE_COLORS: Record<string, string> = {
  Mobile: SERIES[0],
  Desktop: SERIES[2],
  TV: SERIES[3],
};

function DeviceSplit({
  devices,
  total,
}: {
  devices: { _id: string; count: number }[];
  total: number;
}): React.ReactElement {
  return (
    <>
      <div className={styles.deviceBar} role="img"
        aria-label={devices.map((d) => `${d._id} ${share(d.count, total)}`).join(', ')}>
        {devices.map((d) => (
          <span
            key={d._id}
            className={styles.deviceBarSeg}
            style={{
              width: `${(d.count / total) * 100}%`,
              background: DEVICE_COLORS[d._id] ?? SERIES[5],
            }}
            title={`${d._id}: ${d.count} of ${total} (${pct(d.count, total)}%)`}
          />
        ))}
      </div>
      <p className={styles.deviceLegend}>
        {devices.map((d) => (
          <span key={d._id} className={styles.deviceLegendItem}>
            <i
              className={styles.deviceDot}
              style={{ background: DEVICE_COLORS[d._id] ?? SERIES[5] }}
            />
            {d._id} {share(d.count, total)}
          </span>
        ))}
      </p>
    </>
  );
}

export default function DeviceBreakdown({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement | null {
  const detail = data.deviceDetail;
  if (!detail || detail.byRole.length === 0) return null;

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Who is on what</h2>
        <p className={styles.cardNote}>
          Counted per session, split by the role that session was playing. The
          blended figure hides the interesting part: the answer is very
          different for a host than for a singer.
        </p>
        <div className={styles.deviceRoles}>
          {detail.byRole.map((row) => (
            <div key={row.role} className={styles.deviceRole}>
              <h3 className={styles.deviceRoleTitle}>
                {ROLE_LABELS[row.role]?.title ?? row.role}{' '}
                <span className={styles.deviceRoleCount}>{row.total} sessions</span>
              </h3>
              <p className={styles.deviceRoleNote}>{ROLE_LABELS[row.role]?.note ?? ''}</p>
              <DeviceSplit devices={row.devices} total={row.total} />
              <BarList
                data={row.platforms.map((p) => ({ label: p._id, value: p.count }))}
                maxRows={6}
              />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Every platform seen</h2>
        <p className={styles.cardNote}>
          All roles together. TVs are listed by make rather than folded into
          Android, which is what their User-Agent would otherwise claim.
        </p>
        <BarList
          color={SERIES[1]}
          data={detail.byPlatform.map((p) => ({ label: p._id, value: p.count }))}
          maxRows={14}
        />
      </section>
    </>
  );
}
