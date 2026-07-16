import * as React from 'react';
import p from '../../../styles/DisplayDesigner.module.css';

/** Sections of the TV screen the designer can select and edit. */
export type SectionId = 'qr' | 'upNext' | 'nowPlaying' | 'reactions' | 'welcome' | 'attract';
export type PreviewMode = 'live' | 'idle';

/** Clickable region of the preview: hover/selected outline + a name tag.
 * `chrome` holds the section's editing handles (grip, eye, resize). */
export function Spot({
  id,
  selected,
  onSelect,
  label,
  className = '',
  positioned = false,
  chrome,
  children,
}: {
  id: SectionId;
  selected: SectionId | null;
  onSelect: (section: SectionId) => void;
  label: string;
  className?: string;
  /** The wrapper brings its own positioning (e.g. a fixed slot) — skip .hotspot's. */
  positioned?: boolean;
  chrome?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${positioned ? '' : p.hotspot} ${p.spot} ${selected === id ? p.spotOn : ''} ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      {children}
      <span className={p.spotTag}>{label}</span>
      {chrome}
    </div>
  );
}

/** Eye button for a section's chrome cluster: hides the section. */
export function HideButton({ title, onHide }: { title: string; onHide: () => void }) {
  return (
    <button
      className={p.chromeBtn}
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onHide();
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    </button>
  );
}
