import type { AnyBulkWriteOperation, Collection, Filter } from "mongodb";

import { cleanChartArtist, firstCreditedArtist } from "./chartFeed";
import { TITLE_SEPARATOR } from "./corpusProposals";
import type { HarvestedVideo } from "./karaokeChannels";
import {
  getCronStateCollection,
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  getSongProposalsCollection,
  type CronStateDoc,
  type KaraokeSongDoc,
  type SongProposalDoc,
} from "./mongodb";
import { searchCacheKey } from "./searchQuery";
import { entryForSong, songKeyFor, songSignature } from "./songEntry";
import type { CatalogEntry } from "./suggestionCatalog";
import { FILLER, matchHarvestToCatalog, songTokens } from "./suggestionMatch";

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

// Only ever checked alongside filler, in isFillerPart below — a channel tail
// like "Karaoke Version from Zoom Karaoke" is otherwise all filler but for
// the brand name, so the whole part must drop, not just trim.
const CHANNEL_BRAND_WORDS = new Set([
  "zoom",
  "karafun",
  "vevo",
  "stingray",
  "quantum",
  "atomic",
  "partytyme",
  "obskure",
]);

// "from" is also a real title's first word ("From This Moment On"), so it's
// filler only in the whole-part check below, never in fillerWord/trimFillerWords.
const CHANNEL_TAIL_CONNECTORS = new Set(["from"]);

function isFillerPart(part: string): boolean {
  if (songTokens(part).length === 0 || CHANNEL_BRAND_PART.test(part)) return true;
  const words = part
    .split(/\s+/)
    .map((w) => searchCacheKey(w))
    .filter((w) => w.length > 0);
  return (
    words.length > 0 &&
    words.every(
      (w) => IDENTITY_FILLER.has(w) || CHANNEL_BRAND_WORDS.has(w) || CHANNEL_TAIL_CONNECTORS.has(w)
    )
  );
}

const BRACKET_PAIRS: [string, string][] = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["【", "】"],
  ["「", "」"],
  ["（", "）"],
];
const OPEN_TO_CLOSE = new Map(BRACKET_PAIRS);
const CLOSE_TO_OPEN = new Map(BRACKET_PAIRS.map(([open, close]) => [close, open]));

// FILLER drops these for matching leniency, but they're real words in a real
// name ("The Agadiers"), so an identity clean must keep them.
const ARTICLES = new Set(["the", "a", "an"]);

// Extends suggestionMatch's FILLER (not copied). mr/off/vocal/track/minus/one
// are filler only inside FILLER_PHRASES below, not individually here.
const IDENTITY_FILLER = new Set([
  ...Array.from(FILLER).filter((w) => !ARTICLES.has(w)),
  "paroles",
  "letra",
  "lirik",
  "con",
  "y",
  "inst",
  "hq",
  "4k",
  "cc",
]);

// Each phrase's words are filler only together — any one of them alone is too
// common a real word to drop ("Mr Brightside", "Off My Face", "MR KUPIDO").
const FILLER_PHRASES: string[][] = [
  ["off", "vocal"],
  ["mr", "removed"],
  ["backing", "track"],
  ["minus", "one"],
  ["no", "guide", "melody"],
  ["with", "guide", "melody"],
];

function fillerWord(word: string): boolean {
  const key = searchCacheKey(word);
  return key.length > 0 && IDENTITY_FILLER.has(key);
}

/** True only when every word is filler, individually or as one of the fixed
 *  phrases above — "no guide melody" and "minus one" don't read as filler a
 *  word at a time. */
function allFiller(words: string[]): boolean {
  const keys = words.map((w) => searchCacheKey(w)).filter((w) => w.length > 0);
  if (keys.length === 0) return true;
  if (keys.every((w) => IDENTITY_FILLER.has(w))) return true;
  const set = new Set(keys);
  return FILLER_PHRASES.some(
    (phrase) => phrase.length === keys.length && phrase.every((w) => set.has(w))
  );
}

function escapeForCharClass(ch: string): string {
  return /[()[\]{}^\-\\]/.test(ch) ? `\\${ch}` : ch;
}

function stripFillerBrackets(part: string): string {
  let out = part;
  for (const [open, close] of BRACKET_PAIRS) {
    const o = escapeForCharClass(open);
    const c = escapeForCharClass(close);
    const re = new RegExp(`\\s*[${o}]([^${c}]*)[${c}]`, "g");
    out = out.replace(re, (match, inner: string) =>
      allFiller(inner.split(/\s+/).filter((w) => w.length > 0)) ? "" : match
    );
  }
  return out;
}

/** A word ending in a closer whose opener isn't glued to the same word — the
 *  tail of a bracket group that started in an earlier word. */
function unmatchedCloser(word: string): string | null {
  const last = word.charAt(word.length - 1);
  const open = CLOSE_TO_OPEN.get(last);
  return open && word.charAt(0) !== open ? last : null;
}

function unmatchedOpener(word: string): string | null {
  const first = word.charAt(0);
  const close = OPEN_TO_CLOSE.get(first);
  return close && word.charAt(word.length - 1) !== close ? first : null;
}

/** Strips the bracket chars glued to the span's first/last word before the
 *  all-filler check, so "(Guyane Karaoke)" is judged on "Guyane Karaoke". */
function innerWords(span: string[]): string[] {
  return span.map((word, i) => {
    let w = word;
    if (i === 0) w = w.slice(1);
    if (i === span.length - 1) w = w.slice(0, -1);
    return w;
  });
}

// Longest first: "no guide melody" must consume as one 3-word unit before a
// shorter, unlisted "guide melody" slice gets tried and stalls.
const FILLER_PHRASE_LENGTHS = Array.from(new Set(FILLER_PHRASES.map((p) => p.length))).sort(
  (a, b) => b - a
);

/** Words consumed from the given end that are one filler word or phrase; 0
 *  if neither. */
function matchFillerSpan(words: string[], fromEnd: boolean): number {
  for (const len of FILLER_PHRASE_LENGTHS) {
    if (words.length < len) continue;
    const span = fromEnd ? words.slice(words.length - len) : words.slice(0, len);
    if (allFiller(span)) return len;
  }
  return words.length > 0 && fillerWord(fromEnd ? words[words.length - 1] : words[0]) ? 1 : 0;
}

/** Trims filler from both ends only, repeatedly, so a word exposed by the
 *  previous trim is re-checked but a mid-title word never is. A dangling
 *  bracket is trimmed only by consuming the whole group back to its opener,
 *  and only when that group is all filler — otherwise trimming stops there. */
function trimFillerWords(words: string[]): string[] {
  let start = 0;
  let end = words.length;

  while (end > start) {
    const closer = unmatchedCloser(words[end - 1]);
    if (closer) {
      const opener = CLOSE_TO_OPEN.get(closer)!;
      let openIdx = -1;
      for (let i = end - 2; i >= start; i--) {
        if (words[i].charAt(0) === opener) {
          openIdx = i;
          break;
        }
      }
      if (openIdx < 0 || !allFiller(innerWords(words.slice(openIdx, end)))) break;
      end = openIdx;
      continue;
    }
    const consumed = matchFillerSpan(words.slice(start, end), true);
    if (consumed === 0) break;
    end -= consumed;
  }

  while (start < end) {
    const opener = unmatchedOpener(words[start]);
    if (opener) {
      const closer = OPEN_TO_CLOSE.get(opener)!;
      let closeIdx = -1;
      for (let i = start + 1; i < end; i++) {
        if (words[i].charAt(words[i].length - 1) === closer) {
          closeIdx = i;
          break;
        }
      }
      if (closeIdx < 0 || !allFiller(innerWords(words.slice(start, closeIdx + 1)))) break;
      start = closeIdx + 1;
      continue;
    }
    const consumed = matchFillerSpan(words.slice(start, end), false);
    if (consumed === 0) break;
    start += consumed;
  }

  return words.slice(start, end);
}

const HTML_ENTITY = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi;

/** YouTube titles come back HTML-escaped ("Don&#39;t Stop Me Now"); decoded
 *  first so neither the separator split nor the token keys ever see an
 *  entity. */
function decodeEntities(text: string): string {
  return text.replace(HTML_ENTITY, (match, body: string) => {
    const b = body.toLowerCase();
    if (b === "amp") return "&";
    if (b === "lt") return "<";
    if (b === "gt") return ">";
    if (b === "quot") return '"';
    if (b === "apos") return "'";
    const code = b.charAt(1) === "x" ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}

// cleanChartArtist only drops "feat."/"ft." (with the dot) and "featuring";
// a bare "Feat"/"Ft" is just as common on a karaoke upload.
const FEATURING_NO_DOT = /\s+\b(?:feat|ft)\b\s+.*$/i;

/** A part that would clean away to nothing is returned as originally
 *  trimmed — "Karaoke" alone is a bad title, not an empty one. */
export function cleanIdentityPart(part: string): string {
  const original = decodeEntities(part).trim();
  if (!original) return original;

  const debracketed = stripFillerBrackets(original);
  const words = debracketed.split(/\s+/).filter((w) => w.length > 0);
  const trimmed = trimFillerWords(words);
  const afterTrim = trimmed.length > 0 ? trimmed.join(" ") : original;
  const unfeatured = cleanChartArtist(afterTrim).replace(FEATURING_NO_DOT, "");
  const collapsed = unfeatured
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|:,.]+|[\s\-–—|:,.]+$/g, "")
    .trim();
  return collapsed.length > 0 ? collapsed : original;
}

function realParts(label: string): string[] {
  return label
    .split(TITLE_SEPARATOR)
    .map((part) => cleanIdentityPart(part.trim()))
    .filter((part) => part.length > 0 && !isFillerPart(part));
}

/** Coverage alone lets a short name ("Frozen") match deep inside an unrelated
 *  phrase; capping the part's extra words rules that out while still allowing
 *  a featured act or a duet's "Artist Y Other Artist". */
function coversKnownArtist(part: string, knownArtist: string): boolean {
  const need = songTokens(knownArtist);
  if (need.length === 0) return false;
  const have = new Set(songTokens(part));
  if (!need.every((t) => have.has(t))) return false;
  return have.size <= need.length + 3;
}

export interface ArtistEvidence {
  /** Pack/chart credit plus proposal-label recurrence — for ranking, and for
   *  breaking a tie between two sides that both clear packScore. */
  score(part: string): number;
  /** Pack/chart credit alone — the only evidence pickIdentity will name a
   *  side on. Always a multiple of 10, so "some" and ">= NAMEABLE_SCORE" agree. */
  packScore(part: string): number;
}

function evidenceKey(part: string): string {
  return songTokens(cleanIdentityPart(part)).join(" ");
}

/** Built once per run (nightly batch) or once per request (admin GET), from
 *  the same two projections, so a word's score means the same thing in both
 *  places. */
export function buildArtistEvidence(input: {
  songs: { artist: string; nativeArtist?: string; origin?: string }[];
  proposals: { candidates: { artist: string; title: string }[] }[];
}): ArtistEvidence {
  const packScores = new Map<string, number>();
  const totalScores = new Map<string, number>();
  function bump(map: Map<string, number>, key: string, amount: number): void {
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + amount);
  }

  for (const song of input.songs) {
    // Absent is "pack"; a demand song is the thing this pack is correcting,
    // so it must never vouch for its own identity.
    if (song.origin !== undefined && song.origin !== "chart") continue;
    const forms = new Set([song.artist, song.nativeArtist].filter(Boolean) as string[]);
    forms.forEach((form) => {
      const key = evidenceKey(form);
      bump(packScores, key, 10);
      bump(totalScores, key, 10);
      const first = firstCreditedArtist(form);
      if (first !== form) {
        const firstKey = evidenceKey(first);
        bump(packScores, firstKey, 10);
        bump(totalScores, firstKey, 10);
      }
    });
  }

  for (const p of input.proposals) {
    const seen = new Set<string>();
    for (const candidate of p.candidates) {
      [candidate.artist, candidate.title].forEach((side) => {
        const key = evidenceKey(side);
        if (key && !seen.has(key)) {
          seen.add(key);
          bump(totalScores, key, 1);
        }
      });
    }
  }

  return {
    score(part: string): number {
      const key = evidenceKey(part);
      return key ? totalScores.get(key) ?? 0 : 0;
    },
    packScore(part: string): number {
      const key = evidenceKey(part);
      return key ? packScores.get(key) ?? 0 : 0;
    },
  };
}

// Gates packScore, not score: proposal-label recurrence alone (the +1s) can
// break a tie but never name a side — a title recurs across channel variants
// just as often as an artist does.
const NAMEABLE_SCORE = 10;

/** knownArtist settles which half of "A - B" is the artist; otherwise the
 *  side with real pack/chart evidence that strictly beats the other side
 *  wins. A tossup, or one backed only by recurrence, is left null. */
export function pickIdentity(
  p: SongProposalDoc,
  evidence?: ArtistEvidence
): { artist: string; title: string } | null {
  const parts = realParts(p.label);
  if (parts.length !== 2) return null;
  const [a, b] = parts;

  if (p.knownArtist) {
    if (coversKnownArtist(a, p.knownArtist)) return { artist: a, title: b };
    if (coversKnownArtist(b, p.knownArtist)) return { artist: b, title: a };
  }

  const scoreA = evidence ? evidence.score(a) : 0;
  const scoreB = evidence ? evidence.score(b) : 0;
  const packA = evidence ? evidence.packScore(a) : 0;
  const packB = evidence ? evidence.packScore(b) : 0;
  if (packA >= NAMEABLE_SCORE && scoreA > scoreB) return { artist: a, title: b };
  if (packB >= NAMEABLE_SCORE && scoreB > scoreA) return { artist: b, title: a };
  return null;
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
  evidence?: ArtistEvidence,
  identityOverride?: IdentityOverride,
  extraSet?: Record<string, unknown>
): ProposalPromotion {
  const identity = identityOverride ?? pickIdentity(p, evidence);

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
  const [songRows, proposalRows] = await Promise.all([
    songs
      .find({}, { projection: { title: 1, artist: 1, nativeTitle: 1, nativeArtist: 1, origin: 1 } })
      .toArray(),
    proposals.find({}, { projection: { candidates: 1 } }).toArray(),
  ]);
  const deduper = buildSongDeduper(songRows);
  const evidence = buildArtistEvidence({ songs: songRows, proposals: proposalRows });

  const now = new Date();
  const songOps: AnyBulkWriteOperation<KaraokeSongDoc>[] = [];
  const proposalOps: AnyBulkWriteOperation<SongProposalDoc>[] = [];
  let stoppedEarly = false;

  for (const p of candidates) {
    if (Date.now() >= deadline) {
      stoppedEarly = true;
      break;
    }

    const promotion = buildPromotion(p, deduper, now, evidence);
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
  const [songRows, proposalRows] = await Promise.all([
    songs
      .find({}, { projection: { title: 1, artist: 1, nativeTitle: 1, nativeArtist: 1, origin: 1 } })
      .toArray(),
    proposals.find({}, { projection: { candidates: 1 } }).toArray(),
  ]);
  const deduper = buildSongDeduper(songRows);
  // Same evidence the admin GET's `picked` column used, so an approve with no
  // typed override names the song the same way the panel showed it would.
  const evidence = buildArtistEvidence({ songs: songRows, proposals: proposalRows });

  const promotion = buildPromotion(p, deduper, new Date(), evidence, identityOverride, extraSet);
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

// One-off repair of the first production promote run's swapped and
// junk-branded identities. Guarded like lib/corpusMigration's seed. v1 never
// shipped a write, so v2 starts clean rather than carrying its cursor format.
export const REPAIR_ID = "repair-demand-v2";
const REPAIR_BATCH = 100;

export interface RepairReport {
  skipped?: boolean | string;
  kept: number;
  deleted: number;
  reset: number;
}

function emptyRepairReport(): RepairReport {
  return { kept: 0, deleted: 0, reset: 0 };
}

async function saveRepairCursor(state: Collection<CronStateDoc>, cursor: string): Promise<void> {
  const now = new Date();
  await state.updateOne(
    { _id: REPAIR_ID },
    { $set: { cursor, cursorAt: now, updatedAt: now } },
    { upsert: true }
  );
}

/** Keeps a song whose proposal still picks it today, or whose pick now goes
 *  null but it already has real cuts (earned on its own merit, not on the
 *  identity that created it). Everything else is deleted, its key pulled
 *  from karaoke_videos, and its proposal (and any `duplicate` pointing at it)
 *  reset for promote to re-decide. */
async function repairBatch(
  cursor: string,
  evidence: ArtistEvidence,
  report: RepairReport
): Promise<string | null> {
  const songs = await getKaraokeSongsCollection();
  const batch = await songs
    .find(cursor ? { origin: "demand", _id: { $gt: cursor } } : { origin: "demand" })
    .sort({ _id: 1 })
    .limit(REPAIR_BATCH)
    .toArray();
  if (batch.length === 0) return null;

  const proposals = await getSongProposalsCollection();
  const proposalIds = Array.from(
    new Set(batch.filter((s) => s.proposalId).map((s) => s.proposalId as string))
  );
  const proposalById = new Map(
    proposalIds.length === 0
      ? []
      : (await proposals.find({ _id: { $in: proposalIds } }).toArray()).map(
          (p) => [p._id, p] as const
        )
  );

  const deletedIds: string[] = [];
  const proposalOps: AnyBulkWriteOperation<SongProposalDoc>[] = [];

  for (const song of batch) {
    const proposal = song.proposalId ? proposalById.get(song.proposalId) : undefined;
    const newPick = proposal ? pickIdentity(proposal, evidence) : null;
    const unchanged = newPick ? songKeyFor(newPick.artist, newPick.title) === song._id : false;
    if (unchanged || (!newPick && (song.cuts ?? []).length > 0)) {
      report.kept += 1;
      continue;
    }

    deletedIds.push(song._id);
    report.deleted += 1;
    if (proposal) {
      proposalOps.push({
        updateOne: {
          filter: { _id: proposal._id },
          update: { $unset: { promoteOutcome: "", promotedSongId: "", promotedAt: "" } },
        },
      });
      report.reset += 1;
    }
  }

  if (deletedIds.length > 0) {
    const videos = await getKaraokeVideosCollection();
    await videos.updateMany(
      { songKeys: { $in: deletedIds } },
      { $pull: { songKeys: { $in: deletedIds } } }
    );
    await songs.deleteMany({ _id: { $in: deletedIds }, origin: "demand" });

    const orphanedDuplicates = await proposals
      .find(
        {
          promoteOutcome: "duplicate",
          promotedSongId: { $in: deletedIds },
          status: { $exists: false },
        },
        { projection: { _id: 1 } }
      )
      .toArray();
    for (const dup of orphanedDuplicates) {
      proposalOps.push({
        updateOne: {
          filter: { _id: dup._id },
          update: { $unset: { promoteOutcome: "", promotedSongId: "", promotedAt: "" } },
        },
      });
      report.reset += 1;
    }
  }

  if (proposalOps.length > 0) await proposals.bulkWrite(proposalOps, { ordered: false });

  return batch[batch.length - 1]._id;
}

/** Production-only: dev and prod share one database, and this one-time
 *  correction must never run from a laptop. */
export async function repairDemandIdentities(
  deadline: number
): Promise<{ done: boolean; report: RepairReport }> {
  if (process.env.VERCEL_ENV !== "production") {
    return { done: true, report: { ...emptyRepairReport(), skipped: "not production" } };
  }

  const state = await getCronStateCollection();
  const saved = await state.findOne({ _id: REPAIR_ID });
  if (saved?.done) {
    return { done: true, report: { ...emptyRepairReport(), skipped: true } };
  }

  const songs = await getKaraokeSongsCollection();
  const proposals = await getSongProposalsCollection();
  const [songRows, proposalRows] = await Promise.all([
    songs.find({}, { projection: { artist: 1, nativeArtist: 1, origin: 1 } }).toArray(),
    proposals.find({}, { projection: { candidates: 1 } }).toArray(),
  ]);
  const evidence = buildArtistEvidence({ songs: songRows, proposals: proposalRows });

  let cursor = saved?.cursor ?? "";
  const report = emptyRepairReport();

  while (Date.now() < deadline) {
    const next = await repairBatch(cursor, evidence, report);
    if (next === null) {
      const now = new Date();
      await state.updateOne(
        { _id: REPAIR_ID },
        { $set: { done: true, updatedAt: now }, $unset: { cursor: "", cursorAt: "" } },
        { upsert: true }
      );
      return { done: true, report };
    }
    cursor = next;
    await saveRepairCursor(state, cursor);
  }

  await saveRepairCursor(state, cursor);
  return { done: false, report };
}
