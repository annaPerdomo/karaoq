import * as React from 'react';
import styles from '../../styles/Analytics.module.css';
import BarChart from './BarChart';
import { LOCALE_LABELS, isLocale } from '../../lib/i18n/config';

export interface LanguageData {
  /** Per-locale usage from session heartbeats — the language rooms are run in. */
  bySession: {
    _id: string;
    sessions: number;
    rooms: number;
    hosts: number;
    singers: number;
    /** Sessions whose locale came from a deliberate pick, not a guess. */
    chosen: number;
  }[];
  /** Rooms created per locale, including rooms that never saw a session. */
  roomsCreated: { _id: string; count: number }[];
  byCountry: { _id: { country: string; locale: string }; count: number }[];
}

/** Native name for a locale code, falling back to the raw code. */
function localeName(code: string): string {
  return isLocale(code) ? LOCALE_LABELS[code] : code;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * Which UI language people are actually using. Ranked by unique rooms rather
 * than sessions so one long night in one room can't outrank ten rooms, with the
 * chosen-vs-guessed split alongside — that gap is what says whether a language
 * is wanted or merely assumed from the browser/country.
 */
export default function LanguagesPanel({ languages }: { languages: LanguageData }) {
  const { bySession, roomsCreated, byCountry } = languages;

  const totalRooms = bySession.reduce((sum, l) => sum + l.rooms, 0);
  const englishRooms = bySession.find((l) => l._id === 'en')?.rooms ?? 0;
  const nonEnglishRooms = totalRooms - englishRooms;
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
            Non-English rooms: {nonEnglishRooms} of {totalRooms} (
            {pct(nonEnglishRooms, totalRooms)}%)
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
