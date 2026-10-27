import type { NormalizedPlace, Preferences } from "../places/types";

/**
 * Recommendation scoring v1 (contract agreed with GPT-6/Samir in CoBase).
 *
 * 1. Hard filters drop places that clearly don't fit.
 * 2. Each remaining place gets rating, distance and match scores in [0, 1].
 * 3. Final score = weighted sum (weights normalized to sum to 1).
 *
 * Unknown data is never treated as a match: unknown dietary info stays in the
 * results but is tagged in `caveats` and only earns partial match credit.
 */

export type Caveat = `dietary_unverified:${string}` | "open_status_unknown";

export interface ScoreBreakdown {
  rating: number;
  distance: number;
  match: number;
}

export interface RankedPlace extends NormalizedPlace {
  score: number;
  breakdown: ScoreBreakdown;
  caveats: Caveat[];
}

export const DEFAULT_WEIGHTS = { rating: 0.4, distance: 0.3, match: 0.3 } as const;

/** Partial credit for something we can't verify (dietary, cuisine or price unknown). */
export const UNKNOWN_CREDIT = 0.25;
/** Score used when there's nothing to score against. */
export const NEUTRAL = 0.5;
const MIN_RADIUS_KM = 0.1;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 1000) / 1000;

export function normalizeWeights(w: Preferences["weights"]): ScoreBreakdown {
  const safe = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
  const rating = safe(w?.rating);
  const distance = safe(w?.distance);
  const match = safe(w?.match);
  const total = rating + distance + match;
  if (!w || total === 0) return { ...DEFAULT_WEIGHTS };
  return { rating: rating / total, distance: distance / total, match: match / total };
}

/** Dietary status for a preference tag. Only vegetarian/vegan are known; anything else is unknown. */
function dietaryStatus(place: NormalizedPlace, tag: string) {
  const key = tag.toLowerCase() as keyof NormalizedPlace["dietary"];
  return key in place.dietary ? place.dietary[key] : "unknown";
}

/** True if the place should be dropped before scoring. */
export function isExcluded(place: NormalizedPlace, prefs: Preferences): boolean {
  if (place.distanceKm > prefs.radiusKm) return true;

  const wantedCuisines = prefs.cuisines.map((c) => c.toLowerCase());
  if (
    wantedCuisines.length > 0 &&
    place.cuisines.length > 0 &&
    !place.cuisines.some((c) => wantedCuisines.includes(c))
  ) {
    return true;
  }

  if (prefs.priceLevels.length > 0 && place.priceLevel !== null && !prefs.priceLevels.includes(place.priceLevel)) {
    return true;
  }

  if (typeof prefs.minRating === "number" && place.rating !== null && place.rating < prefs.minRating) {
    return true;
  }

  if (prefs.openNow && place.openNow === false) return true;

  if (prefs.dietary.some((tag) => dietaryStatus(place, tag) === "no")) return true;

  return false;
}

export function scorePlace(
  place: NormalizedPlace,
  prefs: Preferences,
  weights = normalizeWeights(prefs.weights),
): RankedPlace {
  const rating = place.rating === null ? NEUTRAL : clamp01(place.rating / 5);
  const distance = clamp01(1 - place.distanceKm / Math.max(prefs.radiusKm, MIN_RADIUS_KM));

  const parts: number[] = [];
  const caveats: Caveat[] = [];

  const wantedCuisines = prefs.cuisines.map((c) => c.toLowerCase());
  if (wantedCuisines.length > 0) {
    if (place.cuisines.length === 0) parts.push(UNKNOWN_CREDIT);
    else parts.push(place.cuisines.some((c) => wantedCuisines.includes(c)) ? 1 : 0);
  }

  if (prefs.priceLevels.length > 0) {
    if (place.priceLevel === null) parts.push(UNKNOWN_CREDIT);
    else parts.push(prefs.priceLevels.includes(place.priceLevel) ? 1 : 0);
  }

  if (prefs.dietary.length > 0) {
    const dietScores = prefs.dietary.map((tag) => {
      const status = dietaryStatus(place, tag);
      if (status === "yes") return 1;
      caveats.push(`dietary_unverified:${tag.toLowerCase()}`);
      return UNKNOWN_CREDIT;
    });
    parts.push(dietScores.reduce((a, b) => a + b, 0) / dietScores.length);
  }

  if (prefs.openNow && place.openNow === null) caveats.push("open_status_unknown");

  const match = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : NEUTRAL;
  const score = weights.rating * rating + weights.distance * distance + weights.match * match;

  return {
    ...place,
    score: round(score),
    breakdown: { rating: round(rating), distance: round(distance), match: round(match) },
    caveats,
  };
}

/**
 * Filter and rank places for a user's preferences. Does not mutate the input.
 * Sorted by score (desc), then ratingCount (desc), then placeId (asc).
 */
export function rankPlaces(places: readonly NormalizedPlace[], prefs: Preferences): RankedPlace[] {
  const weights = normalizeWeights(prefs.weights);
  return places
    .filter((p) => !isExcluded(p, prefs))
    .map((p) => scorePlace(p, prefs, weights))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.ratingCount ?? 0) - (a.ratingCount ?? 0) ||
        a.placeId.localeCompare(b.placeId),
    );
}
