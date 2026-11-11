import { SearchUnavailableError, YoutubeResult } from '../../app/queue/searchYoutube';

export interface Refusal {
  video: YoutubeResult;
  hasCuts: boolean;
}

export function refusalFrom(err: unknown): { refused: Refusal | null; cuts: YoutubeResult[] } {
  if (!(err instanceof SearchUnavailableError) || err.status !== 422 || !err.result) {
    return { refused: null, cuts: [] };
  }
  const cuts = err.cuts ?? [];
  return { refused: { video: err.result, hasCuts: cuts.length > 0 }, cuts };
}
