import * as React from 'react';

// aria-hidden: every use pairs an icon with a visible text label.

function Icon({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const RoomsIcon = () => (
  <Icon>
    <path d="M3 10.5 12 4l9 6.5" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M10 20v-5h4v5" />
  </Icon>
);

export const ErrorsIcon = () => (
  <Icon>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4" />
    <path d="M12 17.2v.1" />
  </Icon>
);

export const SuggestionsIcon = () => (
  <Icon>
    <path d="M9 18h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.9.7 1.5 1.3 1.5 2.1h4c0-.8.6-1.4 1.5-2.1A6 6 0 0 0 12 3Z" />
  </Icon>
);

export const PulseIcon = () => (
  <Icon>
    <path d="M2 12h4l3-8 6 16 3-8h4" />
  </Icon>
);

export const FeedbackIcon = () => (
  <Icon>
    <path d="M21 12a8 8 0 0 1-8 8H4l2-3.2A8 8 0 1 1 21 12Z" />
  </Icon>
);

export const PeopleIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M16 15.2c2.3.2 4 1.8 4.5 4.3" />
  </Icon>
);

export const MicIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3" />
  </Icon>
);

export const HeartIcon = () => (
  <Icon>
    <path d="M12 20.5C7 16.5 3.5 13.4 3.5 9.6A4.4 4.4 0 0 1 8 5.2c1.7 0 3.1.9 4 2.2.9-1.3 2.3-2.2 4-2.2a4.4 4.4 0 0 1 4.5 4.4c0 3.8-3.5 6.9-8.5 10.9Z" />
  </Icon>
);

export const BoardIcon = () => (
  <Icon>
    <rect x="4" y="3.5" width="16" height="17" rx="2" />
    <path d="M8 8.5h8" />
    <path d="M8 12.5h8" />
    <path d="M8 16.5h5" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.9-4.9" />
  </Icon>
);
