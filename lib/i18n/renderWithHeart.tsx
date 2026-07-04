import * as React from 'react';

/**
 * Render a translated string that contains a ♥ marker, replacing the marker
 * with a styled heart span so translators can keep the heart in place and put
 * the surrounding words in natural word order. Falls back to plain text when
 * no marker is present.
 */
export function renderWithHeart(text: string, heartClassName: string): React.ReactNode {
  const parts = text.split('♥');
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 && <span className={heartClassName}>&#9829;</span>}
    </React.Fragment>
  ));
}
