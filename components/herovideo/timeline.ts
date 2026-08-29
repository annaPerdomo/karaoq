// t is milliseconds into the 20s loop; DUR_MS wraps it. Design rationale and
// beat sheet: docs/hero-demo-video.md.
import type * as React from 'react';

export const FPS = 30;
export const DUR_MS = 20000;

// ── Fixture data — the landing page's one continuous cast ──
export const ROOM_CODE = 'X7K2M';
export const JOIN_URL = `https://karaoq.live/sing/${ROOM_CODE}`;
export const GUEST_A = 'Anna';
export const GUEST_B = 'Naomi';
export const ON_STAGE = { singer: 'Toby', song: "Don't Stop Believin'" };
export const LYRICS = [
  'Just a small town girl',
  'Livin’ in a lonely world',
  'She took the midnight train',
];
export const SEARCH_QUERY = 'golden';
export const SEARCH_RESULTS = [
  { title: 'HUNTR/X – Golden (Karaoke)', tapped: true },
  { title: 'Golden – Instrumental + Lyrics', tapped: false },
  { title: 'Golden – Higher Key Karaoke', tapped: false },
];
export const TOAST_TEXT = 'Added “Golden” to the queue!';
export const DUET_SONG = 'Islands in the Stream';

export interface QueueRowSpec {
  singer: string;
  song: string;
  at: number; // ms it lands
  leavesAt?: number; // ms it moves on stage
  flash?: boolean; // the attention beat for rows caused by the phone we follow
}
export const QUEUE_ROWS: QueueRowSpec[] = [
  // Ambient adds land in the gaps between the followed phones' beats, not on top of them.
  { singer: 'Toby', song: "Don't Stop Believin'", at: 5900, leavesAt: 6900 },
  { singer: 'Pascal', song: 'Mr. Brightside', at: 6400 },
  { singer: 'Wallace', song: 'Dancing Queen', at: 8100 },
  { singer: 'Penny', song: 'Levitating', at: 10600 },
  { singer: 'Anna', song: 'Golden', at: 13750, flash: true },
  { singer: 'Naomi & Anna', song: '\u{1F3A4} Islands in the Stream', at: 16100, flash: true },
];

// lane: % across a right-edge column, clear of every lyric line — reactions never cross text.
export const TV_REACTIONS = [
  { emoji: '❤️', at: 9000, lane: 20, sway: -6 },
  { emoji: '\u{1F525}', at: 9550, lane: 62, sway: 7 },
  { emoji: '\u{1F44F}', at: 10050, lane: 8, sway: -5 },
  { emoji: '\u{1F64C}', at: 10600, lane: 74, sway: 6 },
  { emoji: '⭐', at: 11150, lane: 34, sway: -7 },
  { emoji: '\u{1F3A4}', at: 15600, lane: 66, sway: 6 },
  { emoji: '\u{1F44F}', at: 16250, lane: 24, sway: -6 },
  { emoji: '\u{1F929}', at: 16900, lane: 52, sway: 5 },
  { emoji: '\u{1F525}', at: 17550, lane: 12, sway: -5 },
  { emoji: '❤️', at: 18150, lane: 40, sway: 7 },
];

// The real cheer sheet's emoji set (app/queue/cheerConstants.ts), first 8.
export const CHEER_EMOJIS = ['\u{1F525}', '\u{1F44F}', '❤️', '\u{1F3A4}', '⭐', '\u{1F64C}', '\u{1F929}', '\u{1F3B5}'];

// ── Named moments the components key off ──
export const T = {
  codePulse: 1050, // one gold breath on the join code — the ready beat's only motion
  guestTypeStart: 3400, // Anna's join; Naomi arrives already in the room
  guestTypeMsPerChar: 165,
  guestPress: 4400,
  welcomeSwap: 4650, // name gate → in-room screen
  liveStart: 6900, // Toby on stage; the screen's center flips to the playing state
  liveSettled: 7500,
  cheerUiIn: 7750,
  cheerTap: 8600, // Naomi's ❤️
  cheerSentUntil: 10250,
  searchFocus: 11200, // Anna's add
  searchTypeStart: 11300,
  searchTypeMsPerChar: 150,
  searchPress: 12400,
  resultsIn: 12650,
  addTap: 13200,
  toastIn: 13650,
  toastOut: 14650,
  boardsIn: 14900, // the shared Sing-together card, on both phones at once
  joinTap: 15600,
  joinedAt: 15780,
  boardsOut: 19000, // past the phones' exit — the card rides out with them
  restStart: 19150,
  restEnd: 19950, // loop seam: this state must equal t=0's; never dim to black across it
} as const;

/** Placement on the 1200×770 canvas, scaled from the group's top-left corner. */
export interface GuestSpec {
  name: string;
  x: number;
  y: number;
  scale: number;
  inStart: number;
  inEnd: number;
  outStart: number;
  outEnd: number;
  /** Whether we watch this guest through the name gate. */
  gate: boolean;
  /** Tap ripples inside this phone's screen, in unscaled screen coordinates. */
  ripples: { at: number; x: number; y: number }[];
}

// Ripple positions were measured from the rendered DOM
// (video/hero-demo/measure-ripples.mjs) — each sits on the control it "taps".
export const GUESTS: GuestSpec[] = [
  {
    name: GUEST_A,
    x: 668,
    y: 193,
    scale: 0.9,
    inStart: 2400,
    inEnd: 3150,
    outStart: 18600,
    outEnd: 19250,
    gate: true,
    ripples: [
      { at: T.guestPress, x: 115, y: 333 },
      { at: T.searchPress, x: 195, y: 63 },
      { at: T.addTap, x: 206, y: 119 },
      { at: T.joinTap, x: 160, y: 227 },
    ],
  },
  {
    name: GUEST_B,
    x: 926,
    y: 81,
    scale: 0.9,
    inStart: 5000,
    inEnd: 5700,
    outStart: 18300,
    outEnd: 18950,
    gate: false,
    ripples: [{ at: T.cheerTap, x: 141, y: 360 }],
  },
];

// ── Interpolation helpers ──
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const linear = (x: number) => x;
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
// A restrained settle — lands with a ~2% overshoot, not a bounce.
export const easeOutBackSoft = (x: number) => {
  const c = 0.9;
  const p = x - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
};

/** Progress 0→1 across [a, b], eased; clamped outside. */
export function seg(t: number, a: number, b: number, ease: (x: number) => number = easeInOutCubic) {
  return ease(clamp01((t - a) / (b - a)));
}

/** 1 while inside [a, b), else 0. */
export const on = (t: number, a: number, b: number) => (t >= a && t < b ? 1 : 0);

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Fade in over `fade` ms at `a`, out over `fade` ms before `b`. */
export function pulseWindow(t: number, a: number, b: number, fade = 280) {
  if (t < a || t >= b) return 0;
  if (t < a + fade) return easeOutCubic((t - a) / fade);
  if (t > b - fade) return 1 - easeInOutCubic((t - (b - fade)) / fade);
  return 1;
}

/** The substring typed by time t (a fast, natural cadence — not letter drama). */
export function typed(t: number, start: number, msPerChar: number, text: string) {
  if (t < start) return '';
  return text.slice(0, Math.min(text.length, Math.floor((t - start) / msPerChar) + 1));
}

/** A one-shot button press: scale dip + brightness, ~260ms. */
export function pressStyle(t: number, at: number): React.CSSProperties {
  const p = clamp01((t - at) / 260);
  if (p <= 0 || p >= 1) return {};
  const dip = Math.sin(p * Math.PI); // 0→1→0
  return { transform: `scale(${1 - 0.06 * dip})`, filter: `brightness(${1 - 0.18 * dip})` };
}

/** Tap ripple opacity/scale for a press at `at`; null when idle. */
export function rippleState(t: number, at: number) {
  const p = (t - at) / 420;
  if (p <= 0 || p >= 1) return null;
  return { opacity: 0.5 * (1 - easeOutCubic(p)), scale: 0.45 + 0.85 * easeOutCubic(p) };
}

// Phase-locked to t, not real time, so capture stays deterministic.
export function liveDotOpacity(t: number) {
  return 0.65 + 0.35 * Math.sin((t / 1500) * Math.PI * 2);
}
