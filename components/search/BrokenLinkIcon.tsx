import * as React from 'react';

/**
 * A snapped chain link, for the "that link didn't work" states in the search
 * results. Drawn in the brand's pink→purple gradient (the same pair the
 * equalizer bars and section dividers use) so a failed paste still looks like
 * KaraoQ rather than a browser error page.
 *
 * Stroke geometry matches the rest of the app's icons: 1.8 weight, round caps.
 */
export default function BrokenLinkIcon({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="url(#karaoqBrokenLink)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        {/* userSpaceOnUse, not the default objectBoundingBox: the break marks
            are vertical lines, and a zero-width bounding box drops an
            objectBoundingBox gradient entirely — the ticks vanish. It also
            keeps one sweep across the whole icon instead of restarting the
            gradient inside each path. */}
        <linearGradient
          id="karaoqBrokenLink"
          gradientUnits="userSpaceOnUse"
          x1="5"
          y1="0"
          x2="27"
          y2="0"
        >
          <stop offset="0" stopColor="#ff2d78" />
          <stop offset="1" stopColor="#9b1dff" />
        </linearGradient>
      </defs>
      {/* Two halves of a chain link, parted in the middle. Rounded rectangles
          rather than semicircles — at 32px a pair of half-circles reads as
          plain parentheses, not as a link that came apart. */}
      <path d="M14 11H9a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h5" />
      <path d="M18 11h5a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-5" />
      {/* The snap, sitting in the gap between them. */}
      <path d="M16 7.4v2.2" />
      <path d="M16 22.4v2.2" />
    </svg>
  );
}
