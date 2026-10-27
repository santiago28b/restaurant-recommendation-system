import { distanceKm } from "./geo";
import type { DietaryStatus, NormalizedPlace, PriceLevel, RawPlace } from "./types";

/** Places (New) price enum -> 1..4. FREE counts as 1. Missing/unspecified -> null. */
const PRICE_MAP: Record<string, PriceLevel> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function toPriceLevel(raw: string | undefined): PriceLevel | null {
  if (!raw) return null;
  return PRICE_MAP[raw] ?? null;
}

/** Place types that are not a cuisine even though they end in _restaurant. */
const NON_CUISINE_TYPES = new Set([
  "restaurant",
  "fast_food_restaurant",
  "breakfast_restaurant",
  "brunch_restaurant",
  "vegan_restaurant",
  "vegetarian_restaurant",
]);

/** Non-"_restaurant" types that still name a cuisine. */
const EXTRA_CUISINE_TYPES: Record<string, string> = {
  steak_house: "steak",
  sandwich_shop: "sandwich",
  sushi_restaurant: "sushi",
  ramen_restaurant: "ramen",
  pizza_restaurant: "pizza",
};

/** "italian_restaurant" -> "italian". Returns unique cuisine tags in input order. */
export function toCuisines(types: string[] | undefined): string[] {
  const out: string[] = [];
  for (const t of types ?? []) {
    let tag: string | undefined = EXTRA_CUISINE_TYPES[t];
    if (!tag && t.endsWith("_restaurant") && !NON_CUISINE_TYPES.has(t)) {
      tag = t.slice(0, -"_restaurant".length);
    }
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Cuisine tag -> Places type for the search request ("italian" -> "italian_restaurant"). */
export function cuisineToPlaceType(cuisine: string): string {
  const c = cuisine.trim().toLowerCase().replace(/\s+/g, "_");
  const reverse = Object.entries(EXTRA_CUISINE_TYPES).find(([, tag]) => tag === c);
  if (reverse) return reverse[0];
  return `${c}_restaurant`;
}

function tri(value: boolean | undefined): DietaryStatus {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

/**
 * Dietary info, only from what Google states:
 * - vegetarian: servesVegetarianFood, or the place is typed vegetarian/vegan restaurant
 * - vegan: only "yes" when typed vegan_restaurant; otherwise unknown
 * Everything else stays "unknown" — never assume a place is safe.
 */
export function toDietary(raw: RawPlace): NormalizedPlace["dietary"] {
  const types = raw.types ?? [];
  const isVegan = types.includes("vegan_restaurant");
  const isVegetarian = isVegan || types.includes("vegetarian_restaurant");
  return {
    vegetarian: isVegetarian ? "yes" : tri(raw.servesVegetarianFood),
    vegan: isVegan ? "yes" : "unknown",
  };
}

/** Raw Places (New) result -> NormalizedPlace. Returns null if it has no id or location. */
export function normalizePlace(
  raw: RawPlace,
  origin: { lat: number; lng: number },
): NormalizedPlace | null {
  if (!raw.id || !raw.location) return null;
  const coords = { lat: raw.location.latitude, lng: raw.location.longitude };
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? "Unnamed place",
    address: raw.formattedAddress ?? null,
    coords,
    cuisines: toCuisines(raw.types),
    priceLevel: toPriceLevel(raw.priceLevel),
    rating: typeof raw.rating === "number" ? raw.rating : null,
    ratingCount: typeof raw.userRatingCount === "number" ? raw.userRatingCount : null,
    openNow:
      typeof raw.currentOpeningHours?.openNow === "boolean"
        ? raw.currentOpeningHours.openNow
        : null,
    distanceKm: Math.round(distanceKm(origin, coords) * 100) / 100,
    dietary: toDietary(raw),
  };
}
