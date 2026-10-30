# 04 — Brand controls in Customize, applied on every screen

## Why
Prompt 03 stored a room brand but nobody can set it or see it. Hosts edit everything visual in place through Customize (no modals, no preview copies), and Anna's rule is that host and Display Customize offer the same options. This prompt adds one brand section to both rails and paints the logo and colours on the host, the Display and the music-video screen.

## What to build

### 1. Client image prep — `lib/logoImage.ts`
```ts
export const LOGO_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const LOGO_MAX_PX = 384;
export async function prepareLogo(file: File): Promise<string>; // data URL
```
Reject `image/svg+xml`, non-`image/*`, and files over the input cap (throw `Error` with codes `"type"` / `"size"`). `createImageBitmap` → fit inside 384×384 (never upscale) → canvas → `toDataURL("image/webp", q)` starting at q = 0.85 and stepping down to 0.5 until it fits `LOGO_MAX_BYTES`; if the browser returns PNG instead of WebP, fall back to halving the dimensions until it fits. Throw `"size"` only if nothing fits. On every client-side rejection, `postScreenEvent(roomId, "logo_upload_rejected", { reason })` (route from prompt 02). A 507 from the server shows `brand.error.full`.
Plus `uploadLogo(roomId, dataUrl): Promise<{ hash: string; url: string }>` and `saveBrand(roomId, brand): Promise<RoomBrand>` in `app/queue/brand.ts`, matching the fetch style of the existing config savers.

### 2. Shared control — `components/brand/BrandControls.tsx`
Props: `{ roomId: string; brand: RoomBrand; onChange: (next: RoomBrand) => void }`. One rail section titled `brand.title`:
- Logo: thumbnail of the current draft logo (`logoUrl` from `lib/logoUrl.ts` — client-safe; never import `lib/roomLogos.ts` on the client) or an empty box; **Upload** / **Replace** (hidden `<input type="file" accept="image/png,image/jpeg,image/webp">` → `prepareLogo` → `uploadLogo` → `onChange({...brand, logo: hash})`), **Remove**; inline error from `brand.error.type` / `brand.error.size` / `brand.error.upload`; disabled while uploading.
- Colours: two `<input type="color">` labelled `brand.accentA` / `brand.accentB`, prefilled with the current theme accent when unset; **Use theme colours** clears both.
Reuse the rail's existing section/toggle classes (from `Host.module.css` dp* classes the rails already use) — do not restyle. Use `components/brand/BrandControls.module.css` only for the thumbnail and colour row.

### 3. Draft + save, following the `boardsOn` pattern
`useDisplayEdit` (`components/display/edit/useDisplayEdit.ts`) already carries `boardsOnDisplay`, a room field outside `DisplayConfig`, as a draft with `extraDirty`, `onReset`, a settle guard (`savedBoards` + `SAVE_SETTLE_MS`) and its own save call. Extract that mechanism into a reusable hook `components/hooks/useRoomFieldDraft.ts` (`useRoomFieldDraft<T>(live: T, equals: (a: T, b: T) => boolean)` → `{ draft, setDraft, dirty, reset, markSaved, settled }`), port boards onto it with identical behavior, and add a `brand` draft the same way in both `useDisplayEdit` and the host's edit hook (`components/host/edit/useHostEdit.ts` and whatever it composes). Save posts `saveBrand` only when the brand changed. Discard resets the draft (the uploaded draft logo just expires server-side).

### 4. Rendering
- `brandStyle(brandInView)` spread onto the root element's `style` of Display (`.main`), Host, and MusicVideoScreen. `brandInView` is the draft while editing, else the room's brand — editing previews live on the real screen.
- Display header: extract the header block in `components/Display.tsx` (around the `styles.brand` "KaraoQ" wordmark) into `components/display/DisplayHeader.tsx` (presentational, same classes, moves only), then render the club logo before the wordmark: `<img className={styles.clubLogo} src={logoUrl(...)} alt={t("brand.logoAlt")} onError={hide}>`, max-height matched to the wordmark, plus a thin divider. The KaraoQ wordmark stays.
- Host header (`components/host/HostHeader.tsx`): same logo before the `styles.brand` wordmark.
- Music-video screen: logo small in a bottom-right corner at 60% opacity while a video plays; large above the QR on the idle panel.
- Add both `BrandControls` instances to the Display rail and the host rail, in the same position relative to the theme control.
- `Display.tsx` and `Host.tsx` must not grow (invariant 6); the header extraction pays for Display. For Host, extract a seam per CLAUDE.md if needed.

### i18n (`lib/i18n/en.json`)
- `brand.title`: "Your logo & colours"
- `brand.upload`: "Upload logo" · `brand.replace`: "Replace" · `brand.remove`: "Remove"
- `brand.accentA`: "Main colour" · `brand.accentB`: "Second colour"
- `brand.useTheme`: "Use theme colours"
- `brand.logoAlt`: "Venue logo"
- `brand.error.type`: "Use a PNG, JPG or WebP image" · `brand.error.size`: "That image is too large" · `brand.error.upload`: "Upload failed, try again" · `brand.error.full`: "Logo uploads are paused right now, try again later"
- `saveBrand` sends `surface: "host" | "display"` matching the rail it was saved from.

## Tests
1. `prepareLogo` rejects SVG, non-images and oversize input (mock `createImageBitmap`/canvas).
2. `useRoomFieldDraft`: draft follows live while untouched, `dirty` on change, `reset`, settle window ignores a stale poll after save.
3. Existing boards tests in the Display edit suite stay green unchanged.
4. `BrandControls`: upload calls `uploadLogo` and `onChange` with the hash; Remove clears logo; Use theme colours clears both accents; error message on a rejected file.
5. Display renders the logo `<img>` only when `brand.logo` is set and applies `--acc-a` from `brand.accentA`.
6. Display edit save posts `brand` only when it changed; discard leaves the live brand.
7. Host header renders the logo; host Customize shows the same `BrandControls`.

## Out of scope
New themes, fonts, background images, per-surface brands, logo cropping UI, changing the KaraoQ credit/footer.
