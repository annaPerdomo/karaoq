export const POLL_INTERVAL = 3000;
// Backstop only: how long a cast display's heartbeat can stay stale before the
// host falls back to playing on its own screen. Long enough (a couple of poll
// cycles) to ride out a cross-device display reload. Same-browser displays are
// caught far faster by the window-handle watcher, so this rarely comes into play.
export const DISPLAY_GONE_CONFIRM_MS = 6000;
