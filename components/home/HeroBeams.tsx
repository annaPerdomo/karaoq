import * as React from 'react';
import styles from '../../styles/Home.module.css';

// The room's two stage beams, raking across the hero behind everything else.
// They strike after the headline has flickered up and then sway forever — the
// lights coming on, not a loading state.
export default function HeroBeams() {
  return (
    <>
      <div className={`${styles.beam} ${styles.beamA}`} aria-hidden="true" />
      <div className={`${styles.beam} ${styles.beamB}`} aria-hidden="true" />
    </>
  );
}
