/**
 * What the line above the job list says, as a dictionary key + variables, so
 * the sequence of states is testable without a browser:
 *   before any list request completed → "loading" (never a count, never zero)
 *   a request completed with 0 → the real zero
 *   a personalised feed → "X matches of N" (N = the catalogue's roles, the hero's number)
 *   otherwise → "showing X" (+ "ranked" suffix for a signed-in person on the plain feed)
 */
export type ListHeadingInput = { fetchedOnce: boolean; loading: boolean; page: number; count: number; catalogTotal: number; signedIn: boolean; searching: boolean };
export type ListHeading = { key: "home.searching" | "home.bestMatches" | "home.showing"; vars: Record<string, string>; rankedSuffix: boolean };

export function listHeading(s: ListHeadingInput): ListHeading {
  if (!s.fetchedOnce || (s.loading && s.page === 1)) return { key: "home.searching", vars: {}, rankedSuffix: false };
  if (s.signedIn && !s.searching && s.catalogTotal > s.count) return { key: "home.bestMatches", vars: { n: s.count.toLocaleString(), total: s.catalogTotal.toLocaleString() }, rankedSuffix: false };
  return { key: "home.showing", vars: { n: s.count.toLocaleString() }, rankedSuffix: s.signedIn && !s.searching };
}
