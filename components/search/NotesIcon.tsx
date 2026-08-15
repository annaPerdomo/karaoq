import * as React from 'react';

/** The gradient stops ride the theme accents (--acc-a/--acc-b) so the icon
 * follows whichever theme the panel mounts under, with the brand pair as
 * fallback outside a themed root. */
export default function NotesIcon({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="url(#karaoqNotesAccent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        {/* userSpaceOnUse for the same reason as BrokenLinkIcon: the stems are
            near-vertical, and their thin bounding boxes would break an
            objectBoundingBox gradient. */}
        <linearGradient
          id="karaoqNotesAccent"
          gradientUnits="userSpaceOnUse"
          x1="6"
          y1="0"
          x2="26"
          y2="0"
        >
          <stop offset="0" stopColor="var(--acc-a, #ff2d78)" />
          <stop offset="1" stopColor="var(--acc-b, #00f0ff)" />
        </linearGradient>
      </defs>
      <g transform="rotate(-8 16 16)">
        <path d="M11.5 25V10.5L23.5 8v14" />
        <ellipse cx="8.5" cy="25" rx="3" ry="2.6" />
        <ellipse cx="20.5" cy="22" rx="3" ry="2.6" />
      </g>
    </svg>
  );
}
