export const PAIR_TTL_MS = 600_000;

export function isPairCode(s: string): boolean {
  return /^\d{6}$/.test(s.replace(/[\s-]/g, ""));
}

export function formatPairCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
