import type { AnyBulkWriteOperation } from "mongodb";

import { getKaraokeVideosCollection, getSongProposalsCollection } from "./mongodb";
import type { KaraokeVideoDoc, SongProposalDoc } from "./mongodb";
import { stripChannel } from "./songTitle";
import { MIN_ADD_ROOMS } from "./songCorpus";
import { songTokens } from "./suggestionMatch";
import { suggestionCatalog } from "./suggestionCatalog";

// What rooms sing that the catalog has never heard of. An add whose video no
// catalog entry claims is the only demand signal a song outside the catalog can
// ever produce: `demand` counts suggestion taps, and nothing untapped renders.
//
// Curation input, never a writer of karaoke_songs — the catalog is what bounds
// the corpus, so approving a proposal means adding it to a pack.

/** Most recently added first, so a run that can't read every unmapped row reads
 *  the rows rooms are singing now. */
export const PROPOSAL_SCAN_LIMIT = 2000;

/** Below this a title is too generic to stand as a song's identity. */
const MIN_CORE_TOKENS = 2;

/** A core shorter than this only merges on an exact match. Two words are a
 *  phrase half the corpus contains; three are a song. */
const MIN_ABSORB_TOKENS = 3;

/** Branding a channel appends, not a second song: "… (Karaoke Songs with lyrics
 *  - Original key)" is six words past "The Agadiers - Mag Dungan Ta". */
const MAX_EXTRA_TOKENS = 6;

/** Containment alone was too strict: "Hakuna Matata (from The Lion King)" and
 *  "The Lion King - Hakuna Matata with Lyrics On Screen" are one song, and only
 *  "from" keeps the first out of the second. A core has to be nearly covered,
 *  not wholly — four fifths still parts "Dream On" by Nazareth from the Black
 *  Sabbath upload of it, which share two words of three. */
const MERGE_COVERAGE = 0.8;

/** Spaced only, so "Ben&Ben", "K-Pop" and "Jay-R" keep their punctuation. */
const TITLE_SEPARATOR = new RegExp("\\s+[-–—|:]\\s+");

// Bracketed groups that only say "this is a karaoke cut" — dropped from the
// label so the queue reads as song names.
const BRANDING_GROUP = new RegExp(
  "\\s*[\\(\\[][^\\)\\]]*(karaoke|version|versión|lyrics|instrumental|backing|hd|hq|official)[^\\)\\]]*[\\)\\]]",
  "gi"
);

export interface ProposalCluster {
  signature: string;
  label: string;
  tokens: string[];
  videoIds: string[];
  addCount: number;
  rooms: number;
  addsByCountry: Record<string, number>;
  knownArtist?: string;
  lastAddedAt?: Date;
}

/** The words a title is worth clustering on, or [] if it says too little. */
export function proposalTokens(title: string): string[] {
  const words = songTokens(stripChannel(title));
  return words.length >= MIN_CORE_TOKENS ? words : [];
}

/** Order-independent, so two channels writing the same words in a different
 *  order land on one proposal. */
export function proposalSignature(tokens: string[]): string {
  return tokens.slice().sort().join(" ");
}

function cleanLabel(title: string): string {
  const stripped = stripChannel(title).replace(BRANDING_GROUP, "");
  const trimmed = stripped.replace(/\s{2,}/g, " ").trim();
  // A title that was *only* branding is better shown whole than blank.
  return trimmed.length > 0 ? trimmed : stripChannel(title);
}

/** Both readings of "A - B". Which half names the artist is not recoverable
 *  from the title — channels write it either way round — so both are offered
 *  and the person approving picks. */
export function titleCandidates(label: string): { artist: string; title: string }[] {
  const parts = label.split(TITLE_SEPARATOR);
  if (parts.length < 2) return [{ artist: "", title: label }];
  const head = parts[0].trim();
  const tail = parts.slice(1).join(" - ").trim();
  if (!head || !tail) return [{ artist: "", title: label }];
  return [
    { artist: tail, title: head },
    { artist: head, title: tail },
  ];
}

interface Candidate {
  video: KaraokeVideoDoc;
  tokens: string[];
}

/** Every catalog artist filed under one of its own words, so a cluster only
 *  compares against artists it shares a word with. */
function artistIndex(): Map<string, { artist: string; tokens: string[] }[]> {
  const index = new Map<string, { artist: string; tokens: string[] }[]>();
  suggestionCatalog().forEach((entry) => {
    const forms = [entry.artist, entry.nativeArtist];
    for (const form of forms) {
      if (!form) continue;
      const tokens = songTokens(form);
      if (tokens.length === 0) continue;
      const bucket = index.get(tokens[0]) ?? [];
      if (!bucket.some((held) => held.artist === entry.artist)) {
        bucket.push({ artist: entry.artist, tokens });
      }
      index.set(tokens[0], bucket);
    }
  });
  return index;
}

/** An artist the catalog already carries — so the gap is this song, not the
 *  act. Those are the cheapest additions: the pack exists, the taste is proven. */
function knownArtistFor(
  bag: Set<string>,
  index: Map<string, { artist: string; tokens: string[] }[]>
): string | undefined {
  let best: string | undefined;
  bag.forEach((token) => {
    for (const held of index.get(token) ?? []) {
      if (!held.tokens.every((t) => bag.has(t))) continue;
      // The longest wins: "Ben&Ben" and "Ben" both cover, and the fuller name
      // is the one that identifies an act.
      if (!best || held.artist.length > best.length) best = held.artist;
    }
  });
  return best;
}

/** Shortest core first, so a bare "The Agadiers - Mag Dungan Ta" is the identity
 *  and every branded upload of it joins rather than founding its own. */
function seedOrder(a: Candidate, b: Candidate): number {
  return (
    a.tokens.length - b.tokens.length ||
    (b.video.sources?.adds?.count ?? 0) - (a.video.sources?.adds?.count ?? 0) ||
    (a.video._id < b.video._id ? -1 : 1)
  );
}

export function clusterProposals(videos: KaraokeVideoDoc[]): ProposalCluster[] {
  const candidates: Candidate[] = [];
  for (const video of videos) {
    const tokens = proposalTokens(video.title ?? "");
    if (tokens.length > 0) candidates.push({ video, tokens });
  }
  candidates.sort(seedOrder);

  const clusters: ProposalCluster[] = [];
  const byToken = new Map<string, ProposalCluster[]>();
  const rooms = new Map<string, Set<string>>();
  const labels = new Map<string, string>();
  const index = artistIndex();

  for (const candidate of candidates) {
    const bag = new Set(candidate.tokens);
    // Only clusters sharing a word can be a subset, and a subset shares all of
    // them — so any one of this title's words finds every possible home.
    const signature = proposalSignature(candidate.tokens);
    let home: ProposalCluster | undefined;
    bag.forEach((token) => {
      if (home) return;
      for (const cluster of byToken.get(token) ?? []) {
        if (cluster.signature === signature) {
          home = cluster;
          return;
        }
        // Two words are a phrase half the corpus contains, so a short core only
        // ever takes an exact match.
        if (cluster.tokens.length < MIN_ABSORB_TOKENS) continue;
        const covered = cluster.tokens.filter((t) => bag.has(t)).length;
        if (covered / cluster.tokens.length < MERGE_COVERAGE) continue;
        if (candidate.tokens.length - covered > MAX_EXTRA_TOKENS) continue;
        home = cluster;
        return;
      }
    });

    if (!home) {
      const known = knownArtistFor(bag, index);
      home = {
        signature,
        label: cleanLabel(candidate.video.title ?? ""),
        tokens: candidate.tokens,
        videoIds: [],
        addCount: 0,
        rooms: 0,
        addsByCountry: {},
        ...(known ? { knownArtist: known } : {}),
      };
      clusters.push(home);
      rooms.set(home.signature, new Set<string>());
      labels.set(home.signature, home.label);
      for (const token of candidate.tokens) {
        const bucket = byToken.get(token) ?? [];
        bucket.push(home);
        byToken.set(token, bucket);
      }
    }

    const adds = candidate.video.sources?.adds;
    home.videoIds.push(candidate.video._id);
    home.addCount += adds?.count ?? 0;
    const seen = rooms.get(home.signature)!;
    for (const roomId of adds?.rooms ?? []) seen.add(roomId);
    const byCountry = adds?.byCountry ?? {};
    for (const country of Object.keys(byCountry)) {
      home.addsByCountry[country] =
        (home.addsByCountry[country] ?? 0) + byCountry[country];
    }
    const at = adds?.lastAt;
    if (at && (!home.lastAddedAt || at > home.lastAddedAt)) home.lastAddedAt = at;
  }

  for (const cluster of clusters) cluster.rooms = rooms.get(cluster.signature)!.size;
  // Rooms before adds, as cuts are ranked: one room adding a song ten times is
  // a claim, and the bar for a proposal is the same consensus a cut has to meet.
  clusters.sort((a, b) => b.rooms - a.rooms || b.addCount - a.addCount);
  return clusters;
}

export interface ProposalReport {
  scanned: number;
  clustered: number;
  /** Of those, the ones meeting MIN_ADD_ROOMS — the queue worth reading. */
  seconded: number;
  written: number;
}

export async function proposeUnmappedAdds(
  deadline: number,
  limit: number = PROPOSAL_SCAN_LIMIT
): Promise<{ done: boolean; report: ProposalReport }> {
  const report: ProposalReport = {
    scanned: 0,
    clustered: 0,
    seconded: 0,
    written: 0,
  };
  if (Date.now() >= deadline) return { done: false, report };

  const videos = await getKaraokeVideosCollection();
  // No songKeys is the whole signal: the matcher saw this title and no catalog
  // entry claimed it.
  const unmapped = await videos
    .find(
      {
        "sources.adds": { $exists: true },
        $or: [{ songKeys: { $exists: false } }, { songKeys: { $size: 0 } }],
      },
      { projection: { title: 1, sources: 1 } }
    )
    .sort({ "sources.adds.lastAt": -1 })
    .limit(limit)
    .toArray();

  report.scanned = unmapped.length;
  const clusters = clusterProposals(unmapped);
  report.clustered = clusters.length;
  report.seconded = clusters.filter((c) => c.rooms >= MIN_ADD_ROOMS).length;
  if (clusters.length === 0) return { done: report.scanned < limit, report };

  const now = new Date();
  const proposals = await getSongProposalsCollection();
  const ops: AnyBulkWriteOperation<SongProposalDoc>[] = clusters.map((cluster) => ({
    updateOne: {
      filter: { _id: cluster.signature },
      update: {
        // Re-derived, never accumulated: the evidence is only ever what the
        // unexpired videos still say, so a song rooms dropped decays out.
        $set: {
          label: cluster.label,
          candidates: titleCandidates(cluster.label),
          videoIds: cluster.videoIds,
          addCount: cluster.addCount,
          rooms: cluster.rooms,
          addsByCountry: cluster.addsByCountry,
          ...(cluster.knownArtist ? { knownArtist: cluster.knownArtist } : {}),
          updatedAt: now,
        },
        // Cleared rather than left behind: the catalog can drop an act, and a
        // stale "we already have them" is the one hint that misleads.
        ...(cluster.knownArtist ? {} : { $unset: { knownArtist: "" as const } }),
        // Never $set: a ruling is a person's, and re-running must not reopen it.
        $setOnInsert: { firstSeenAt: now },
      },
      upsert: true,
    },
  }));

  try {
    const written = await proposals.bulkWrite(ops, { ordered: false });
    report.written = written.upsertedCount + written.modifiedCount;
  } catch (e: any) {
    console.warn("Proposal write partly failed:", e?.message);
  }
  return { done: report.scanned < limit, report };
}
