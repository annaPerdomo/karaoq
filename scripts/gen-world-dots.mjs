// Regenerates lib/home/worldDots.ts — the dot-grid world map the landing page
// lights up per country. Run only when the grid resolution or bounds change:
//
//   node scripts/gen-world-dots.mjs
//
// Source geometry is Natural Earth 1:50m admin-0 (public domain), downloaded on
// demand and never committed — 3MB of GeoJSON in, ~9KB of run-length string out.
// 50m rather than 110m because 110m drops the small island states (Singapore,
// Malta, Mauritius) that show up in our country list.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'ne_50m_countries.geojson');
const OUT = path.join(ROOT, 'lib', 'home', 'worldDots.ts');

// Equirectangular, Antarctica cropped off the bottom. The top stops at 78° so
// Svalbard and northern Norway survive without handing a third of the canvas to
// empty Arctic. COLS/ROWS keep cells near-square at these bounds (360/132 ≈ 2.7).
const COLS = 170;
const ROWS = 63;
const MIN_LAT = -56;
const MAX_LAT = 78;

async function loadGeoJson() {
  if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  console.log('Downloading Natural Earth 50m…');
  const resp = await fetch(SOURCE);
  if (!resp.ok) throw new Error(`Natural Earth download failed: ${resp.status}`);
  const text = await resp.text();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, text);
  return JSON.parse(text);
}

/** Rings (outer + holes alike — even-odd handles both) with a bbox for prefiltering. */
function toShapes(feature) {
  const geom = feature.geometry;
  if (!geom) return [];
  const polys =
    geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates
    : [];
  return polys.map((rings) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { rings, minX, minY, maxX, maxY };
  });
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInShape(x, y, shape) {
  if (x < shape.minX || x > shape.maxX || y < shape.minY || y > shape.maxY) return false;
  // Even-odd across every ring: a point inside a hole flips back out.
  let inside = false;
  for (const ring of shape.rings) if (pointInRing(x, y, ring)) inside = !inside;
  return inside;
}

/** Area-weighted centre of a country's largest ring — its "put a dot here" point. */
function representativePoint(shapes) {
  let best = null;
  let bestArea = -1;
  for (const shape of shapes) {
    const area = (shape.maxX - shape.minX) * (shape.maxY - shape.minY);
    if (area > bestArea) {
      bestArea = area;
      best = shape;
    }
  }
  if (!best) return null;
  return [(best.minX + best.maxX) / 2, (best.minY + best.maxY) / 2];
}

const cellLon = (col) => -180 + ((col + 0.5) / COLS) * 360;
const cellLat = (row) => MAX_LAT - ((row + 0.5) / ROWS) * (MAX_LAT - MIN_LAT);

async function main() {
  const geo = await loadGeoJson();

  const countries = [];
  for (const f of geo.features) {
    const code = f.properties.ISO_A2_EH || f.properties.ISO_A2;
    if (!code || code === '-99' || code.length !== 2) continue;
    const shapes = toShapes(f);
    if (!shapes.length) continue;
    countries.push({ code, shapes, point: representativePoint(shapes) });
  }
  console.log(`${countries.length} countries with geometry`);

  // owner[cell] = ISO-2 code, or null for sea.
  const owner = new Array(COLS * ROWS).fill(null);
  for (let row = 0; row < ROWS; row++) {
    const lat = cellLat(row);
    for (let col = 0; col < COLS; col++) {
      const lon = cellLon(col);
      for (const c of countries) {
        let hit = false;
        for (const shape of c.shapes) {
          if (pointInShape(lon, lat, shape)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          owner[row * COLS + col] = c.code;
          break;
        }
      }
    }
  }

  // A country smaller than a ~2° cell (Singapore, Malta, Luxembourg) can miss
  // every cell centre. Rather than vanish it gets an entry in EXTRA pointing at
  // the cell its centre falls in — the map is a "we're everywhere" gesture, and
  // a country silently missing from it reads as a bug.
  //
  // Two cases, both correct geographically: an island state's cell is sea, so
  // the cell becomes land and belongs to it outright; a landlocked microstate's
  // cell already belongs to a big neighbour, so the two simply share the dot and
  // it lights for whichever of them is active.
  const placed = new Set(owner.filter(Boolean));
  const extra = {};
  for (const c of countries) {
    if (placed.has(c.code) || !c.point) continue;
    const [lon, lat] = c.point;
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(((lon + 180) / 360) * COLS)));
    const row = Math.min(
      ROWS - 1,
      Math.max(0, Math.floor(((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * ROWS))
    );
    const idx = row * COLS + col;
    if (!owner[idx]) {
      owner[idx] = c.code;
      placed.add(c.code);
    } else {
      extra[c.code] = idx;
    }
  }
  const extraCount = Object.keys(extra).length;
  console.log(
    `${placed.size + extraCount} countries on the grid ` +
      `(${extraCount} sharing a neighbour's dot)`
  );

  // Run-length encode the row-major scan: "-42,RU9,-3,CA11". Land is a quarter
  // of the grid and arrives in contiguous blobs, so runs compress it ~7x.
  const runs = [];
  let current = owner[0];
  let count = 0;
  for (const cell of owner) {
    if (cell === current) {
      count++;
    } else {
      runs.push(`${current ?? '-'}${count}`);
      current = cell;
      count = 1;
    }
  }
  runs.push(`${current ?? '-'}${count}`);
  const encoded = runs.join(',');

  const landCount = owner.filter(Boolean).length;
  console.log(`${landCount} land dots, ${encoded.length} chars encoded`);

  const source = `// GENERATED by scripts/gen-world-dots.mjs — do not edit by hand.
// A ${COLS}x${ROWS} equirectangular dot grid of the world (Antarctica cropped),
// each land dot tagged with the ISO-3166-1 alpha-2 country that owns it, so the
// landing page can light up the countries KaraoQ has actually been sung in.
// Source: Natural Earth 1:50m admin-0 (public domain).

export const GRID = {
  cols: ${COLS},
  rows: ${ROWS},
  minLat: ${MIN_LAT},
  maxLat: ${MAX_LAT},
} as const;

/**
 * Row-major run-length encoding of the grid: comma-separated runs of
 * \`<code><length>\`, where \`-\` means sea. ${landCount} of ${COLS * ROWS} cells are land.
 */
export const WORLD_DOTS_RLE =
  '${encoded}';

/**
 * Countries too small to own a cell centre, mapped to the grid cell holding
 * them. These share that cell with the neighbour that owns it, so the dot
 * lights for either country.
 */
export const SHARED_DOTS: Record<string, number> = ${JSON.stringify(extra, null, 2)};
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, source);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${source.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
