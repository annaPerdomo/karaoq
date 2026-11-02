import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DayBilledWire } from '../types';
import { formatDay } from './day';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const OUTCOME: Record<string, string> = {
  new: 'Seeded',
  widened: 'More cuts',
  missed: 'Nothing new',
};

export default function QuotaMopUpSongs({
  day,
  today,
}: {
  day: DayBilledWire;
  today: string;
}): React.ReactElement | null {
  const songs = day.mopUpSongs;
  if (!songs || songs.length === 0) return null;
  const seeded = songs.filter((s) => s.outcome === 'new').length;
  const widened = songs.filter((s) => s.outcome === 'widened').length;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        What the mop-up found {day.day === today ? 'today' : `on ${formatDay(day.day, true)}`}
      </h2>
      <p className={styles.cardNote}>
        {plural(songs.length, 'search', 'searches')}:{' '}
        {plural(seeded, 'song', 'songs')} seeded with their first karaoke cuts,{' '}
        {plural(widened, 'thin song', 'thin songs')} given more.
      </p>
      <div className={styles.quotaScroll}>
        <table className={styles.quotaTable}>
          <thead>
            <tr>
              <th scope="col">Song</th>
              <th scope="col">Artist</th>
              <th scope="col">Result</th>
              <th scope="col">Cuts added</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song, i) => (
              <tr key={`${song.artist}-${song.title}-${i}`}>
                <td>{song.title}</td>
                <td>{song.artist}</td>
                <td>{OUTCOME[song.outcome] ?? song.outcome}</td>
                <td>{song.cutsAdded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
