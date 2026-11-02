import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DaySpendWire, QuotaLedgerData } from '../types';
import Disclosure from '../pulse/Disclosure';
import { formatDay } from './day';

function leftoverCell(day: DaySpendWire): string {
  const mopUp = day.mopUp;
  if (!mopUp) return 'didn’t run';
  if (mopUp.skipped) return `skipped: ${mopUp.skipped}`;
  let cell = `${mopUp.filled} songs resolved from ${mopUp.searched} searches`;
  if (mopUp.liveRooms > 0) cell += ` · ${mopUp.liveRooms} rooms were live`;
  if (mopUp.error) cell += ` · failed: ${mopUp.error}`;
  return cell;
}

export default function QuotaLedger({ data }: { data: QuotaLedgerData }): React.ReactElement {
  return (
    <Disclosure summary="Where the whole budget went, last 7 days">
      <section className={styles.card}>
        <p className={styles.cardNote}>
          Rooms spend first. The nightly corpus job resolves new song
          suggestions after that, and in the day&rsquo;s last 15 minutes a
          &ldquo;mop-up&rdquo; spends whatever is left on more suggestions so no
          quota goes to waste.
        </p>
        <div className={styles.quotaScroll}>
          <table className={styles.quotaTable}>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Rooms</th>
                <th scope="col">Nightly corpus</th>
                <th scope="col">Total</th>
                <th scope="col">Leftover mop-up</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((day) => (
                <tr key={day.day}>
                  <td>
                    {formatDay(day.day)}
                    {day.day === data.today ? ' (today)' : ''}
                  </td>
                  <td>{day.searches - day.cronSearches - (day.unloggedSearches ?? 0)}</td>
                  <td>{day.cronSearches}</td>
                  <td className={day.searches >= data.quota ? styles.quotaOverTotal : undefined}>
                    {day.searches} of {data.quota}
                  </td>
                  <td>{leftoverCell(day)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Disclosure>
  );
}
