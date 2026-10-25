/**
 * Pure scheduling rules for the web-questions harvest (no DB / network), so
 * pages and the harvester agree on when a paid ~15s search may start.
 */
export const WEB_QUESTIONS_TTL_DAYS = 30;
/** After a failed attempt (no client, search threw) wait this long before retrying. */
export const WEB_QUESTIONS_RETRY_MS = 6 * 3600_000;
/** A harvest marked as started less than this long ago is considered still running. */
export const WEB_QUESTIONS_INFLIGHT_MS = 2 * 60_000;

export type HarvestRow = {
  harvestedAt?: Date | string | null;
  attemptedAt?: Date | string | null;
  harvestStartedAt?: Date | string | null;
  error?: string | null;
};

export type HarvestState = {
  /** A successful (or at least completed) harvest is within the TTL. */
  fresh: boolean;
  /** Someone started a harvest less than WEB_QUESTIONS_INFLIGHT_MS ago. */
  inFlight: boolean;
  /** The last attempt failed less than WEB_QUESTIONS_RETRY_MS ago. */
  backingOff: boolean;
  /** A new harvest should start now. */
  due: boolean;
};

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() || 0 : 0);

export function harvestState(row: HarvestRow | null | undefined, now: number = Date.now()): HarvestState {
  const fresh = ms(row?.harvestedAt) > now - WEB_QUESTIONS_TTL_DAYS * 864e5;
  const inFlight = ms(row?.harvestStartedAt) > now - WEB_QUESTIONS_INFLIGHT_MS;
  const backingOff = !fresh && !!row?.error && ms(row?.attemptedAt) > now - WEB_QUESTIONS_RETRY_MS;
  return { fresh, inFlight, backingOff, due: !fresh && !inFlight && !backingOff };
}
