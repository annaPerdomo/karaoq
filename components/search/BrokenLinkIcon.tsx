import * as React from 'react';

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
            objectBoundingBox gradient entirely — the ticks vanish. */}
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
      {/* Two halves of a chain link. Rounded rectangles rather than
          semicircles — at 32px half-circles read as plain parentheses. */}
      <path d="M14 11H9a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h5" />
      <path d="M18 11h5a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-5" />
      <path d="M16 7.4v2.2" />
      <path d="M16 22.4v2.2" />
    </svg>
  );
}
