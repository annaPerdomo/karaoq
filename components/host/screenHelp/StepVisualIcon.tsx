import * as React from "react";
import { StepVisual } from "../../../lib/screenHelpSteps";

const PATHS: Record<Exclude<StepVisual, "winK" | "winP">, React.ReactNode> = {
  screenMirroring: (
    <>
      <rect x="2" y="4" width="14" height="10" rx="2" />
      <rect x="8" y="10" width="14" height="10" rx="2" fill="currentColor" fillOpacity="0.3" />
    </>
  ),
  controlCenter: (
    <>
      <rect x="3" y="4.5" width="18" height="6.5" rx="3.25" />
      <circle cx="17.5" cy="7.75" r="1.75" fill="currentColor" />
      <rect x="3" y="13" width="18" height="6.5" rx="3.25" />
      <circle cx="6.5" cy="16.25" r="1.75" fill="currentColor" />
    </>
  ),
  cast: (
    <>
      <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
      <path d="M2 16.1A5 5 0 0 1 5.9 20" />
      <path d="M2 12.05A9 9 0 0 1 9.95 20" />
      <circle cx="2.5" cy="19.5" r="0.6" fill="currentColor" />
    </>
  ),
  chromeMenu: (
    <>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // Keep in sync with FullscreenToggle's icon: this pictures that exact button.
  fullscreen: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </>
  ),
  input: (
    <>
      <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
      <path d="M9 16l4-4-4-4" />
      <path d="M13 12H3" />
    </>
  ),
  hdmi: (
    <>
      <path d="M2.5 8h19v4.5L19 15.5H5l-2.5-3z" />
      <path d="M6.5 11h11" />
    </>
  ),
  usbc: (
    <>
      <rect x="4" y="8.5" width="16" height="7" rx="3.5" />
      <path d="M8 12h8" />
    </>
  ),
  swipeTopRight: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M15 4.5v6" />
      <path d="M13 8.5l2 2 2-2" />
    </>
  ),
  swipeTop: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M12 4.5v6" />
      <path d="M10 8.5l2 2 2-2" />
    </>
  ),
};

function WindowsKey(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8.5" height="8.5" />
      <rect x="12.5" y="3" width="8.5" height="8.5" />
      <rect x="3" y="12.5" width="8.5" height="8.5" />
      <rect x="12.5" y="12.5" width="8.5" height="8.5" />
    </svg>
  );
}

export function StepVisualIcon({ visual, className, keyClassName }: { visual: StepVisual; className?: string; keyClassName?: string }) {
  if (visual === "winK" || visual === "winP") {
    return (
      <span className={className} aria-hidden="true">
        <kbd className={keyClassName}>
          <WindowsKey />
        </kbd>
        +
        <kbd className={keyClassName}>{visual === "winK" ? "K" : "P"}</kbd>
      </span>
    );
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[visual]}
    </svg>
  );
}
