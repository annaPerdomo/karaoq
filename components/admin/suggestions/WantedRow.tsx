import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { WantedSongRow } from '../types';
import { countryFlag } from '../format';

/** Flags past this are noise in a one-line row. */
const MAX_FLAGS = 6;

/** The client appends this in karaoke mode, so nearly every label carries it. */
const TRAILING_MODE_WORD = /\s+karaoke$/i;

function flags(countries: { code: string; count: number }[]): string {
  return countries
    .slice(0, MAX_FLAGS)
    .map((c) => countryFlag(c.code))
    .filter(Boolean)
    .join(' ');
}

/** The middle state is the actionable one: catalogued with no cuts is a song
 *  the resolver can buy tonight, where an unknown one needs approving first. */
function status(row: WantedSongRow): { label: string; className: string } {
  if (row.hasCuts) {
    return { label: 'IN THE CORPUS', className: styles.wantedTagHeld };
  }
  if (row.catalogued) {
    return { label: 'CATALOGUED, NO CUTS', className: styles.wantedTagNear };
  }
  return { label: 'NOT CATALOGUED', className: styles.wantedTagGap };
}

export default function WantedRow({
  row,
  position,
  rank,
}: {
  row: WantedSongRow;
  position: number;
  rank: 'breadth' | 'volume';
}): React.ReactElement {
  const tag = status(row);
  const countries = row.countries.length;
  const facts = [
    `${countries} ${countries === 1 ? 'country' : 'countries'}`,
    `${row.rooms}+ rooms`,
    `${row.count} searches`,
  ];
  if (row.spent > 0) facts.push(`${row.spent} paid for`);
  if (row.unmet > 0) facts.push(`${row.unmet} came back empty`);

  return (
    <div className={styles.rankRow}>
      <span className={styles.rankNum}>#{position}</span>
      <span className={styles.rankMain}>
        <span className={styles.rankTitle}>
          {row.label.replace(TRAILING_MODE_WORD, '')}
          <span className={`${styles.wantedTag} ${tag.className}`}>{tag.label}</span>
        </span>
        <span className={styles.rankSub}>
          <span className={styles.wantedFlags} aria-hidden="true">
            {flags(row.countries)}
          </span>
          {facts.join(' · ')}
        </span>
      </span>
      <span className={styles.rankCount}>
        {rank === 'volume' ? `${row.count}×` : `${countries} 🌍`}
      </span>
    </div>
  );
}
