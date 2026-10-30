# 03 — Room brand: data, logo storage, APIs

## Why
Clubs want their own logo and colours on the screens. KaraoQ has themes but no per-room brand and no image storage at all. This prompt adds the server side (one brand per room, shared by host, Display and the music-video screen) so prompt 04 can add the controls.

## What to build

### 1. Types — `pages/api/types.ts`
```ts
export interface RoomBrand {
  /** Hash of a committed logo in room_logos; absent = no logo. */
  logo?: string;
  /** "#rrggbb"; absent = the theme's own accent. */
  accentA?: string;
  accentB?: string;
}
```
Add `brand?: RoomBrand` to `Room`. The brand is room-level, **not** a field of `DisplayConfig` or `HostConfig` (one setting, both surfaces — invariant 4).

### 2. Validation — `lib/limits.ts`
`export const LOGO_MAX_BYTES = 64 * 1024;` `export const LOGO_STORE_BUDGET_BYTES = 25 * 1024 * 1024;` `export function isValidRoomBrand(b: unknown): b is RoomBrand` — object, only known keys, `logo` matches `/^[0-9a-f]{16}$/`, accents match `/^#[0-9a-f]{6}$/i`.

### 3. Logo store — `lib/roomLogos.ts`
Collection `room_logos`, doc `{ _id: \`${roomId}:${hash}\`, roomId, contentType, size: number, data: Binary, createdAt, expireAt?: Date }`. Getter in `lib/mongodb.ts` next to `getFeedbackCollection`, ensuring a TTL index on `expireAt` (`expireAfterSeconds: 0`) and an index on `roomId`, with the same once-only guard pattern.
```ts
export function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null; // magic bytes only
export function logoHash(buf: Buffer): string; // sha256 hex, first 16 chars
export async function saveDraftLogo(roomId: string, buf: Buffer, contentType: string): Promise<string>; // upsert, expireAt = now + 24h, returns hash
export async function commitLogo(roomId: string, hash: string): Promise<boolean>; // false if missing; unsets expireAt on it, deletes the room's other logos
export async function readLogo(roomId: string, hash: string): Promise<{ contentType: string; data: Buffer } | null>;
export function logoUrl(roomId: string, hash: string): string; // `/api/queue/${roomId}/logo?h=${hash}`
export async function logoStoreBytes(): Promise<number>; // $sum of `size` over the collection
export async function pruneOrphanLogos(): Promise<number>; // deletes logos whose roomId no longer exists in rooms; returns count
```
Storage budget (invariant 7): `saveDraftLogo` throws a typed `LogoStoreFullError` when `logoStoreBytes() + size > LOGO_STORE_BUDGET_BYTES` (re-uploading an identical hash for the same room never counts twice).
Orphan pruning: call `pruneOrphanLogos()` once per day from the existing `pages/api/cron/suggestions.ts`, only on its first slot (no `slot` param), wrapped so any error is logged and never fails or delays the cron's own work. Do not add a cron entry to `vercel.json`.
Lifecycle rule: an upload is a **draft** that expires in 24 h, so Discard in Customize never changes the live logo. Saving the brand commits it (no expiry) and removes the room's other logos, so a room holds at most one committed logo.

### 4. `POST /api/queue/[id]/logo` and `GET /api/queue/[id]/logo?h=` → `pages/api/queue/[id]/logo.ts`
- `export const config = { api: { bodyParser: { sizeLimit: "400kb" } } }`.
- POST body `{ dataUrl: string }`. `rateLimit(req, "logo", 10, 60_000)`. Room must exist (404). Decode base64; reject > `LOGO_MAX_BYTES` (413) and anything `sniffImageType` rejects (400) — including SVG, regardless of the data-URL's declared type. Store with the sniffed type. `LogoStoreFullError` → 507 `{ error: "storage_full" }`. Respond `{ hash, url }`. Analytics: `logo_uploaded` `{ roomId, bytes }` on success, `logo_upload_rejected` `{ roomId, reason: "size" | "type" | "storage_full" }` on 413/400/507.
- GET: `h` must match the hash regex (400). Missing → 404. Serve bytes with the stored `Content-Type`, `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`.

### 5. `POST /api/queue/[id]/brand` → `pages/api/queue/[id]/brand.ts`
Body `{ brand: RoomBrand }` (full replacement; `{}` clears everything). `rateLimit(req, "brand", 20, 60_000)`. `isValidRoomBrand` → else 400. If `brand.logo` is set and differs from the room's current logo, `commitLogo` must return true, else 400. Write `brand` on the room the same way `display-config.ts` writes its field (including whatever `lastActivity` bump it does). If `brand.logo` is unset and the room had one, delete the room's logos. `trackEvent(req, "brand_saved", { roomId, logo: !!brand.logo, colors: !!(brand.accentA || brand.accentB), cleared: <brand is {}> , surface: "host" | "display" })` — `surface` comes from the request body (`{ brand, surface }`, validated enum, default `"display"`), so the admin panel can tell which Customize rail is used. Respond `{ brand }`.

### 6. Pure style helper — `lib/brandStyle.ts`
```ts
export function brandStyle(brand: RoomBrand | undefined): Record<string, string>; // {"--acc-a": ..., "--acc-b": ..., "--acc-b-rgb": "r, g, b"} only for set accents
```

## Tests
1. `sniffImageType`: PNG, JPEG, WebP accepted; SVG text, GIF, empty, truncated rejected.
2. `isValidRoomBrand`: accepts `{}` and full; rejects unknown keys, bad hex, bad hash, non-objects.
3. `brandStyle`: no brand → `{}`; accentB yields matching `--acc-b-rgb`.
4. Logo POST: stores a draft with `expireAt`, returns hash + url; 413 oversize; 400 for an SVG payload labelled `image/png`; 404 unknown room; 429.
5. Logo GET: correct headers and bytes; 404 unknown hash; 400 malformed hash.
7. Upload past `LOGO_STORE_BUDGET_BYTES` → 507 `storage_full`, nothing stored; same-hash re-upload does not double-count.
8. `pruneOrphanLogos` deletes only logos of rooms that no longer exist; the cron calls it on the first slot only and a thrown prune does not fail the cron.
9. Analytics: `logo_uploaded` / `logo_upload_rejected` reasons; `brand_saved` carries `surface`.
6. Brand POST: commits the logo (expireAt unset, other logos deleted); 400 when the hash was never uploaded; `{}` clears and deletes logos; 400 on invalid body; analytics fired.

## Out of scope
Any UI or applying the brand anywhere (prompt 04), changes to `DisplayConfig`/`HostConfig`/themes, room-key auth (no other config route has it), image resizing on the server.
