// No imports: lib/suggestionMatch needs this, and lib/chartFeed's own import
// graph reaches back to the matcher.

const FIRST_CREDIT_SEPARATOR = /\s&\s|,\s|\sx\s/i;

/** Only for matching — never what gets inserted. Used by the chart feed's
 *  dedupe against a pack entry keyed on one name, corpusPromote's evidence
 *  scoring, and the matcher's lead-act variant, which all credit the same
 *  first-named act. */
export function firstCreditedArtist(artist: string): string {
  return artist.split(FIRST_CREDIT_SEPARATOR)[0].trim();
}
