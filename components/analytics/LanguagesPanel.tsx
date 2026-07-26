import * as React from 'react';
import styles from '../../styles/Analytics.module.css';
import BarChart from './BarChart';
import { LOCALE_LABELS, isLocale } from '../../lib/i18n/config';

export interface LanguageData {
  bySession: {
    _id: string;
    sessions: number;
    rooms: number;
    hosts: number;
    singers: number;
    /** Sessions whose locale came from a deliberate pick, not a guess. */
    chosen: number;
  }[];
  roomsCreated: { _id: string; count: number }[];
  byCountry: { _id: { country: string; locale: string }; count: number }[];
  /** Counted server-side: summing bySession's per-locale rooms would count a
   * mixed-language room once per locale. */
  uniqueRooms: number;
  nonEnglishRooms: number;
}

function localeName(code: string): string {
  return isLocale(code) ? LOCALE_LABELS[code] : code;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export default function LanguagesPanel({ languages }: { languages: LanguageData }) {
  const { bySession, roomsCreated, byCountry, uniqueRooms, nonEnglishRooms } = languages;

  const totalChosen = bySession.reduce((sum, l) => sum + l.chosen, 0);
  const totalSessions = bySession.reduce((sum, l) => sum + l.sessions, 0);

  if (bySession.length === 0 && roomsCreated.length === 0) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Languages</h2>
        <p className={styles.empty}>
          No language data yet — it starts arriving with the next room.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Languages in Use (by rooms)</h2>
        <div className={styles.sessionStats}>
          <span>Languages seen: {bySession.length}</span>
          <span>
            Non-English rooms: {nonEnglishRooms} of {uniqueRooms} (
            {pct(nonEnglishRooms, uniqueRooms)}%)
          </span>
          <span>
            Picked deliberately: {pct(totalChosen, totalSessions)}% of sessions
          </span>
        </div>
        <BarChart
          data={bySession.map((l) => ({
            label: `${localeName(l._id)} (${l._id})`,
            value: l.rooms,
          }))}
          color="#34d399"
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Language Detail</h2>
        {bySession.length === 0 ? (
          <p className={styles.empty}>No sessions with a language yet</p>
        ) : (
          <div className={styles.detailList}>
            {bySession.map((l) => (
              <div key={l._id} className={styles.detailItem}>
                <div className={styles.detailItemMain}>
                  <span className={styles.detailName}>{localeName(l._id)}</span>
                  <span className={styles.detailItemMeta}>
                    {l.rooms} rooms · {l.sessions} sessions · {l.hosts} hosts ·{' '}
                    {l.singers} singers · chosen by {pct(l.chosen, l.sessions)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Rooms Created by Language</h2>
        <BarChart
          data={roomsCreated.map((l) => ({
            label: `${localeName(l._id)} (${l._id})`,
            value: l.count,
          }))}
          color="#38bdf8"
        />
      </section>

      {byCountry.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Language by Country (by rooms)</h2>
          <BarChart
            data={byCountry.map((d) => ({
              label: `${d._id.country} · ${localeName(d._id.locale)}`,
              value: d.count,
            }))}
            color="#f472b6"
          />
        </section>
      )}
    </>
  );
}
