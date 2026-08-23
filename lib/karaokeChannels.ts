// A channel's uploads cost 1 unit per 50 videos out of the 10,000/day pool, not
// the 100 search.list calls/day. Channels hold 10,000-17,000 uploads each, hence
// the total page budget and the saved cursor.

/** Override with KARAOKE_CHANNELS (comma separated, @ optional). */
const DEFAULT_CHANNEL_HANDLES = [
  // Verified against channels.list. Plausible ones that didn't resolve
  // (ZoomKaraoke, KaraokeyTV, KaraokeDeutschland, KaraokeVersion) are left out.
  "SingKingKaraoke",
  "KaraFun",
  "ZoomKaraokeOfficial",
  "PartyTymeKaraoke",
  "sing2piano",
  "AtomicKaraoke",
  "KaraokeOnVEVO",
  "StingrayKaraoke",
  "TheKARAOKEChannelOfficial",
  "ProSingKaraoke",
  "QuantumKaraoke",
  "KaraokeSongsWithLyrics",
  "LowKeyKaraoke",
  "ObsKure",
  // Language packs: the catalog is ~40% non-English.
  "MusisiKaraoke", // id
  "KaraokeBrasilOficial", // br
  "OPMKaraoke", // ph
  "KaraokePilipinas", // ph
  "KaraokeFrancais", // fr
  "HindiKaraoke", // in
  "BollywoodKaraokeTracks", // in
  "SaregamaKaraoke", // in
  "DAMchannel", // jp
  "KaraokeJP", // jp
  "KpopKaraoke", // kr
  "kpopmrremoved", // kr
  "KaraokeEnEspanol", // es
  "KaraokeLatino", // es
  "MusicaKaraoke", // es
  "KaraokeCZ", // cz
  "karaoketexty", // cz
  "KaraokeBrasil", // br
  "CantaJunto", // br
  "KaraokeDangdut", // id
  "KaraokeTanpaVokal", // id
  // No German channel found — nine plausible handles all 404'd, so the de pack
  // stays search-resolved until a real one goes in KARAOKE_CHANNELS.
];

export function karaokeChannelHandles(): string[] {
  const configured = process.env.KARAOKE_CHANNELS;
  const list = configured
    ? configured.split(",").map((h) => h.trim())
    : DEFAULT_CHANNEL_HANDLES;
  return list.map((h) => h.replace(/^@/, "")).filter(Boolean);
}

/** KARAOKE_PLAYLISTS (comma separated) — ids from a playlist URL's ?list= param. */
export function karaokePlaylistIds(): string[] {
  return (process.env.KARAOKE_PLAYLISTS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Playlists first; named as the cursor store names them. */
export function harvestTargets(handles: string[]): string[] {
  return [...karaokePlaylistIds().map((id) => `playlist:${id}`), ...handles];
}

export interface HarvestedVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channel: string;
}

/** A refusal that will refuse the next target too, as against a dead handle. */
function isWall(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

/** channels.list — 1 unit. `wall` says whether the failure was API-wide. */
async function uploadsPlaylistId(
  handle: string,
  key: string
): Promise<{ playlistId: string | null; wall: boolean }> {
  const params = new URLSearchParams({
    part: "contentDetails",
    forHandle: handle,
    key,
  });
  const resp = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?" + params,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!resp.ok) return { playlistId: null, wall: isWall(resp.status) };
  const data = await resp.json();
  return {
    playlistId:
      data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null,
    wall: false,
  };
}

/** 1 unit per page of 50. A null page is a failed call, which must not read as
 *  "no more pages" — that parks the channel as finished for good. */
async function playlistPage(
  playlistId: string,
  key: string,
  pageToken?: string
): Promise<{
  page: { videos: Omit<HarvestedVideo, "channel">[]; next?: string } | null;
  wall: boolean;
}> {
  const params = new URLSearchParams({
    part: "snippet",
    playlistId,
    maxResults: "50",
    key,
  });
  if (pageToken) params.set("pageToken", pageToken);
  const resp = await fetch(
    "https://www.googleapis.com/youtube/v3/playlistItems?" + params,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!resp.ok) return { page: null, wall: isWall(resp.status) };
  const data = await resp.json();
  const videos = (data?.items ?? [])
    .map((item: any) => ({
      videoId: item?.snippet?.resourceId?.videoId ?? "",
      title: item?.snippet?.title ?? "",
      thumbnailUrl:
        item?.snippet?.thumbnails?.medium?.url ||
        item?.snippet?.thumbnails?.default?.url ||
        "",
    }))
    // A private or deleted upload still occupies a row, with no usable id.
    .filter((v: any) => v.videoId && v.title && v.title !== "Private video");
  return { page: { videos, next: data?.nextPageToken }, wall: false };
}

export interface HarvestReport {
  channels: string[];
  missing: string[];
  units: number;
  pages: number;
  /** The budget, the clock, or a wall of API errors ended the sweep early. */
  stoppedEarly: boolean;
}

/** Mirrors HarvestCursorDoc in lib/mongodb. */
export interface HarvestCursor {
  playlistId?: string;
  pageToken?: string;
  completedAt?: Date;
}

export interface ChannelBatch {
  /** The handle, or "playlist:<id>" for an explicit playlist. */
  channel: string;
  videos: HarvestedVideo[];
  cursor: HarvestCursor;
}

export interface HarvestOptions {
  /** A *total*: a per-channel cap times the handle list is not a budget. */
  totalPages: number;
  pagesPerChannel: number;
  cursors: Map<string, HarvestCursor>;
  /** Stop starting work here: a killed run means units spent, nothing written. */
  deadlineMs: number;
  resweepAfterMs: number;
  onChannel: (batch: ChannelBatch) => Promise<void>;
  /** Called as each page is bought, so a run that throws later has still told
   *  the day's ledger what it spent. */
  onPages?: (pages: number) => void;
}

// Wall failures only: handles get renamed, and letting three dead ones end the
// sweep walls off every target behind them — where the language packs are.
const MAX_CONSECUTIVE_FAILURES = 3;

export async function harvestKaraokeChannels(
  handles: string[],
  opts: HarvestOptions
): Promise<HarvestReport> {
  const key = process.env.YOUTUBE_API_KEY;
  const report: HarvestReport = {
    channels: [],
    missing: [],
    units: 0,
    pages: 0,
    stoppedEarly: false,
  };
  if (!key) return report;

  const targets = harvestTargets(handles);

  const spent = () => report.pages >= opts.totalPages || Date.now() >= opts.deadlineMs;
  let consecutiveFailures = 0;

  for (const target of targets) {
    if (spent()) {
      report.stoppedEarly = true;
      break;
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      report.stoppedEarly = true;
      break;
    }

    const cursor: HarvestCursor = { ...(opts.cursors.get(target) ?? {}) };
    if (cursor.completedAt) {
      // Re-walking from the top spends budget on pages the store already holds.
      if (Date.now() - cursor.completedAt.getTime() < opts.resweepAfterMs) continue;
      cursor.completedAt = undefined;
      cursor.pageToken = undefined;
    }

    try {
      let playlistId = cursor.playlistId;
      if (!playlistId) {
        if (target.startsWith("playlist:")) {
          playlistId = target.slice("playlist:".length);
        } else {
          report.units += 1;
          const resolved = await uploadsPlaylistId(target, key);
          playlistId = resolved.playlistId ?? undefined;
          if (!playlistId) {
            report.missing.push(target);
            if (resolved.wall) consecutiveFailures += 1;
            continue;
          }
        }
        cursor.playlistId = playlistId;
      }

      const videos: HarvestedVideo[] = [];
      let pageToken = cursor.pageToken;
      let exhausted = false;
      let failed = false;
      let wall = false;
      for (let page = 0; page < opts.pagesPerChannel; page++) {
        if (spent()) {
          report.stoppedEarly = true;
          break;
        }
        report.units += 1;
        report.pages += 1;
        opts.onPages?.(1);
        const res = await playlistPage(playlistId, key, pageToken);
        if (!res.page) {
          failed = true;
          wall = res.wall;
          break;
        }
        for (const video of res.page.videos) {
          videos.push({ ...video, channel: target });
        }
        if (!res.page.next) {
          exhausted = true;
          break;
        }
        pageToken = res.page.next;
      }

      if (failed && videos.length === 0) {
        report.missing.push(target);
        if (wall) {
          consecutiveFailures += 1;
          continue;
        }
        // A page token YouTube rejects it will keep rejecting.
        cursor.pageToken = undefined;
        await opts.onChannel({ channel: target, videos: [], cursor });
        continue;
      }
      consecutiveFailures = 0;
      report.channels.push(target);

      // Only running out of pages marks a channel finished.
      cursor.pageToken = exhausted ? undefined : pageToken;
      if (exhausted) cursor.completedAt = new Date();
      await opts.onChannel({ channel: target, videos, cursor });
    } catch {
      // One unreachable channel must not lose the ones already harvested.
      report.missing.push(target);
      consecutiveFailures += 1;
    }
  }
  return report;
}
