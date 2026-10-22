import type { AnyBulkWriteOperation, Filter } from "mongodb";

import { TITLE_SEPARATOR } from "./corpusProposals";
import type { HarvestedVideo } from "./karaokeChannels";
import {
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  getSongProposalsCollection,
  type KaraokeSongDoc,
  type SongProposalDoc,
} from "./mongodb";
import { entryForSong, songKeyFor, songSignature } from "./songEntry";
import type { CatalogEntry } from "./suggestionCatalog";
import { matchHarvestToCatalog, songTokens } from "./suggestionMatch";

// A proposal with enough breadth becomes a cutless karaoke_songs doc; the
// existing free claim step fills its cuts from videos we already banked.

export const PROMOTE_MIN_ROOMS = 3;
export const PROMOTE_MIN_COUNTRIES = 2;
export const PROMOTE_PER_RUN = 150;

function countryCount(p: Pick<SongProposalDoc, "addsByCountry" | "searchesByCountry">): number {
  return new Set([
    ...Object.keys(p.addsByCountry ?? {}),
    ...Object.keys(p.searchesByCountry ?? {}),
  ]).size;
}

export function qualifies(p: SongProposalDoc): boolean {
  if (p.status === "rejected") return false;
  if (p.status === "approved") return true;
  // Search-only evidence never auto-promotes, breadth or not.
  if (p.rooms < 1) return false;
  const rooms = p.rooms + (p.searchRooms ?? 0);
  return rooms >= PROMOTE_MIN_ROOMS || countryCount(p) >= PROMOTE_MIN_COUNTRIES;
}

function countryKeys(field: string): Record<string, unknown> {
  return {
    $map: {
      input: { $objectToArray: { $ifNull: [field, {}] } },
      in: "$$this.k",
    },
  };
}

/** Mirrors qualifies() at the query level, so PROMOTE_PER_RUN's limit is spent
 *  on real candidates instead of filling with rows the loop would skip. */
function candidateFilter(): Filter<SongProposalDoc> {
  return {
    promoteOutcome: { $exists: false },
    promotedSongId: { $exists: false },
    status: { $ne: "rejected" },
    $or: [
      { status: "approved" },
      {
        rooms: { $gte: 1 },
        $or: [
          {
            $expr: {
              $gte: [
                { $add: ["$rooms", { $ifNull: ["$searchRooms", 0] }] },
                PROMOTE_MIN_ROOMS,
              ],
            },
          },
          {
            $expr: {
              $gte: [
                {
                  $size: {
                    $setUnion: [countryKeys("$addsByCountry"), countryKeys("$searchesByCountry")],
                  },
                },
                PROMOTE_MIN_COUNTRIES,
              ],
            },
          },
        ],
      },
    ],
  } as Filter<SongProposalDoc>;
}

// A channel's own brand, written as if it were half the title ("Song - Artist
// | Karaoke Version | KaraFun"); dropped before deciding which half is which.
const CHANNEL_BRAND_PART = /^(karafun|sing\s*king)$/i;

function isFillerPart(part: string): boolean {
  return songTokens(part).length === 0 || CHANNEL_BRAND_PART.test(part);
}

function realParts(label: string): string[] {
  return label
    .split(TITLE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !isFillerPart(part));
}

function coversKnownArtist(part: string, knownArtist: string): boolean {
  const need = songTokens(knownArtist);
  if (need.length === 0) return false;
  const have = new Set(songTokens(part));
  return need.every((t) => have.has(t));
}

/** Which half of "A - B" is the artist isn't knowable from the title alone;
 *  knownArtist — a catalog act this cluster's words cover — breaks the tie. */
export function pickIdentity(p: SongProposalDoc): { artist: string; title: string } | null {
  const parts = realParts(p.label);
  if (parts.length !== 2) return null;
  const [a, b] = parts;

  let artist = b;
  let title = a;
  if (p.knownArtist) {
    if (coversKnownArtist(a, p.knownArtist)) {
      artist = a;
      title = b;
    } else if (coversKnownArtist(b, p.knownArtist)) {
      artist = b;
      title = a;
    }
  }
  return artist && title ? { artist, title } : null;
}

type SongIdentitySource = Pick<
  KaraokeSongDoc,
  "_id" | "title" | "artist" | "nativeTitle" | "nativeArtist" | "origin"
>;

/** Romanised, native, and the two cross combinations — whichever reading a
 *  differently-sourced duplicate happened to be titled in. */
function identitySignatures(song: SongIdentitySource): Set<string> {
  const artists = new Set([song.artist, song.nativeArtist ?? song.artist]);
  const titles = new Set([song.title, song.nativeTitle ?? song.title]);
  const sigs = new Set<string>();
  artists.forEach((artist) => titles.forEach((title) => sigs.add(songSignature(artist, title))));
  return sigs;
}

export interface SongDeduper {
  /** The matching song's _id, or null when neither check covers the pair. */
  find(artist: string, title: string): string | null;
  add(song: SongIdentitySource): void;
}

/** Shared with prompt 05's chart feeder. A signature catches an exact re-word;
 *  the claim matcher (lib/suggestionMatch) catches anything close enough to
 *  file as the same cut, which a bare signature set would miss. */
export function buildSongDeduper(songs: SongIdentitySource[]): SongDeduper {
  const bySignature = new Map<string, string>();
  const entries: CatalogEntry[] = [];

  function register(song: SongIdentitySource): void {
    identitySignatures(song).forEach((sig) => {
      if (!bySignature.has(sig)) bySignature.set(sig, song._id);
    });
    entries.push(entryForSong(song));
  }
  songs.forEach(register);

  return {
    find(artist, title) {
      const direct = bySignature.get(songSignature(artist, title));
      if (direct) return direct;

      const probe: HarvestedVideo = {
        videoId: "_dedupe",
        title: `${artist} - ${title} karaoke`,
        thumbnailUrl: "",
        channel: "",
      };
      let matchedId: string | null = null;
      matchHarvestToCatalog([probe], entries, 1).forEach((rows, songId) => {
        if (!matchedId && rows.length > 0) matchedId = songId;
      });
      return matchedId;
    },
    add(song) {
      register(song);
    },
  };
}

export type IdentityOverride = { artist: string; title: string };

interface ProposalPromotion {
  outcome: "promoted" | "duplicate" | "unnamed";
  songKey?: string;
  songOp?: AnyBulkWriteOperation<KaraokeSongDoc>;
  proposalOp: AnyBulkWriteOperation<SongProposalDoc>;
}

/** Shared by the nightly batch and the admin approve action so the two paths
 *  can't diverge; `extraSet` merges an admin-only field into the same write. */
function buildPromotion(
  p: SongProposalDoc,
  deduper: SongDeduper,
  now: Date,
  identityOverride?: IdentityOverride,
  extraSet?: Record<string, unknown>
): ProposalPromotion {
  const identity = identityOverride ?? pickIdentity(p);
  if (!identity) {
    return {
      outcome: "unnamed",
      proposalOp: {
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { promoteOutcome: "unnamed", promotedAt: now, ...extraSet } },
        },
      },
    };
  }

  const match = deduper.find(identity.artist, identity.title);
  if (match) {
    return {
      outcome: "duplicate",
      songKey: match,
      proposalOp: {
        updateOne: {
          filter: { _id: p._id },
          update: {
            $set: {
              promoteOutcome: "duplicate",
              promotedAt: now,
              promotedSongId: match,
              ...extraSet,
            },
          },
        },
      },
    };
  }

  const key = songKeyFor(identity.artist, identity.title);
  // Kept in the same deduper so two candidates naming the same song in this
  // run don't both insert — the second sees the first as a duplicate.
  deduper.add({ _id: key, title: identity.title, artist: identity.artist, origin: "demand" });
  return {
    outcome: "promoted",
    songKey: key,
    songOp: {
      updateOne: {
        filter: { _id: key },
        update: {
          // $setOnInsert only: a race promoting the same proposal twice must
          // not clobber cuts claim has already started filling.
          $setOnInsert: {
            title: identity.title,
            artist: identity.artist,
            cuts: [],
            addCount: 0,
            addsByCountry: {},
            // No wantedIn: recordDemand fills both from real search demand,
            // and absent sorts a brand-new song last for the resolver anyway.
            demand: 0,
            origin: "demand",
            promotedAt: now,
            proposalId: p._id,
          },
        },
        upsert: true,
      },
    },
    proposalOp: {
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: { promoteOutcome: "promoted", promotedAt: now, promotedSongId: key, ...extraSet },
        },
      },
    },
  };
}

export interface PromoteReport {
  scanned: number;
  promoted: number;
  duplicates: number;
  unnamed: number;
}

export async function promoteDemand(
  deadline: number
): Promise<{ done: boolean; report: PromoteReport }> {
  const report: PromoteReport = { scanned: 0, promoted: 0, duplicates: 0, unnamed: 0 };
  if (Date.now() >= deadline) return { done: false, report };

  const proposals = await getSongProposalsCollection();
  const candidates = await proposals
    .find(candidateFilter())
    .sort({ rooms: -1, addCount: -1 })
    .limit(PROMOTE_PER_RUN)
    .toArray();
  report.scanned = candidates.length;
  if (candidates.length === 0) return { done: true, report };

  const songs = await getKaraokeSongsCollection();
  const deduper = buildSongDeduper(
    await songs
      .find({}, { projection: { title: 1, artist: 1, nativeTitle: 1, nativeArtist: 1, origin: 1 } })
      .toArray()
  );

  const now = new Date();
  const songOps: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
  const proposalOps: AnyBulkWriteOperation<SongProposalDoc>[] = [];
  let stoppedEarly = false;

  for (const p of candidates) {
    if (Date.now() >= deadline) {
      stoppedEarly = true;
      break;
    }

    const promotion = buildPromotion(p, deduper, now);
    if (promotion.outcome === "unnamed") report.unnamed += 1;
    else if (promotion.outcome === "duplicate") report.duplicates += 1;
    else report.promoted += 1;
    if (promotion.songOp) songOps.push(promotion.songOp);
    proposalOps.push(promotion.proposalOp);
  }

  if (songOps.length > 0) await songs.bulkWrite(songOps, { ordered: false });
  if (proposalOps.length > 0) await proposals.bulkWrite(proposalOps, { ordered: false });

  return { done: !stoppedEarly && report.scanned < PROMOTE_PER_RUN, report };
}

/** One proposal, written immediately rather than batched; omitting
 *  `identityOverride` falls back to pickIdentity as the nightly run does. */
export async function promoteProposal(
  p: SongProposalDoc,
  identityOverride?: IdentityOverride,
  extraSet?: Record<string, unknown>
): Promise<{ result: "promoted" | "duplicate" | "unnamed"; songId?: string }> {
  const songs = await getKaraokeSongsCollection();
  const proposals = await getSongProposalsCollection();
  const deduper = buildSongDeduper(
    await songs
      .find({}, { projection: { title: 1, artist: 1, nativeTitle: 1, nativeArtist: 1, origin: 1 } })
      .toArray()
  );

  const promotion = buildPromotion(p, deduper, new Date(), identityOverride, extraSet);
  if (promotion.songOp) await songs.bulkWrite([promotion.songOp], { ordered: false });
  await proposals.bulkWrite([promotion.proposalOp], { ordered: false });
  return { result: promotion.outcome, songId: promotion.songKey };
}

const MAX_IDENTITY_LEN = 200;

/** Both fields or neither: one given alone is a half-typed form, not an
 *  override. Each must tokenize to something, so punctuation or whitespace
 *  alone can't become a song's identity. */
export function parseIdentityOverride(
  artist: unknown,
  title: unknown
): { ok: true; identity?: IdentityOverride } | { ok: false } {
  if (artist === undefined && title === undefined) return { ok: true };
  if (typeof artist !== "string" || typeof title !== "string") return { ok: false };

  const a = artist.trim();
  const t = title.trim();
  if (!a || !t || a.length > MAX_IDENTITY_LEN || t.length > MAX_IDENTITY_LEN) {
    return { ok: false };
  }
  if (songTokens(a).length === 0 || songTokens(t).length === 0) return { ok: false };
  return { ok: true, identity: { artist: a, title: t } };
}

export async function approveProposal(
  id: string,
  identityOverride?: IdentityOverride
): Promise<{ result: "promoted" | "duplicate" | "unnamed"; songId?: string } | null> {
  const proposals = await getSongProposalsCollection();
  const p = await proposals.findOne({ _id: id });
  if (!p) return null;

  if (p.promoteOutcome === "promoted") {
    return { result: "promoted", songId: p.promotedSongId };
  }

  return promoteProposal(p, identityOverride, { status: "approved" });
}

export async function rejectProposal(
  id: string
): Promise<{ result: "rejected"; removedSongId?: string } | null> {
  const proposals = await getSongProposalsCollection();
  const p = await proposals.findOne({ _id: id });
  if (!p) return null;

  // Only the proposal that actually created a song may take it back out —
  // a proposal that merely matched one (promoteOutcome "duplicate") never owned it.
  if (p.promoteOutcome === "promoted" && p.promotedSongId) {
    const songs = await getKaraokeSongsCollection();
    const song = await songs.findOne({ _id: p.promotedSongId });
    if (song && song.origin === "demand" && song.proposalId === p._id) {
      await songs.deleteOne({ _id: song._id });
      const videos = await getKaraokeVideosCollection();
      await videos.updateMany({ songKeys: song._id }, { $pull: { songKeys: song._id } });
      await proposals.updateOne(
        { _id: id },
        { $set: { status: "rejected" }, $unset: { promotedSongId: "" } }
      );
      return { result: "rejected", removedSongId: song._id };
    }
  }

  await proposals.updateOne({ _id: id }, { $set: { status: "rejected" } });
  return { result: "rejected" };
}
