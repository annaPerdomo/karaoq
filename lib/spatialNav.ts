export type NavDir = 'up' | 'down' | 'left' | 'right';

export interface NavRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface NavCandidate {
  id: string;
  rect: NavRect;
}

function center(r: NavRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function pickNext(from: NavRect, candidates: NavCandidate[], dir: NavDir): string | null {
  const f = center(from);
  let bestId: string | null = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const c = center(candidate.rect);
    let inDir: boolean;
    let primary: number;
    let offAxis: number;

    switch (dir) {
      case 'up':
        inDir = c.y < f.y;
        primary = f.y - c.y;
        offAxis = Math.abs(c.x - f.x);
        break;
      case 'down':
        inDir = c.y > f.y;
        primary = c.y - f.y;
        offAxis = Math.abs(c.x - f.x);
        break;
      case 'left':
        inDir = c.x < f.x;
        primary = f.x - c.x;
        offAxis = Math.abs(c.y - f.y);
        break;
      case 'right':
        inDir = c.x > f.x;
        primary = c.x - f.x;
        offAxis = Math.abs(c.y - f.y);
        break;
    }

    if (!inDir) continue;
    const score = primary + 2 * offAxis;
    if (score < bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return bestId;
}

interface KeyLike {
  key: string;
  keyCode?: number;
}

const ARROW_KEYS: Record<string, NavDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const ARROW_KEYCODES: Record<number, NavDir> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
};

export function navDirFromKey(e: KeyLike): NavDir | null {
  if (e.key in ARROW_KEYS) return ARROW_KEYS[e.key];
  if (e.keyCode !== undefined && e.keyCode in ARROW_KEYCODES) return ARROW_KEYCODES[e.keyCode];
  return null;
}

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack']);
// 10009 = Tizen's remote Back/Return key, 461 = webOS's, 27 = Escape.
const BACK_KEYCODES = new Set([10009, 461, 27]);

export function isBackKey(e: KeyLike): boolean {
  if (BACK_KEYS.has(e.key)) return true;
  if (e.keyCode !== undefined && BACK_KEYCODES.has(e.keyCode)) return true;
  return false;
}
