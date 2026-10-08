import { randomInt } from "crypto";

export const PAIR_TTL_MS = 600_000;

// Remote codes mint a co-host key on claim, so they get a wider brute-force
// margin than a screen code, which only ever hands out a display key.
export function newPairCode(kind: "screen" | "remote"): string {
  const digits = kind === "remote" ? 8 : 6;
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

export function isPairCode(s: string): boolean {
  return /^(\d{6}|\d{8})$/.test(s.replace(/[\s-]/g, ""));
}

export function formatPairCode(code: string): string {
  return code.length === 8
    ? `${code.slice(0, 4)} ${code.slice(4)}`
    : `${code.slice(0, 3)} ${code.slice(3)}`;
}
