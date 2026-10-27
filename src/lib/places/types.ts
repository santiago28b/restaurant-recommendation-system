/**
 * Shared shapes agreed in CoBase (Restaurant Recommendation System project).
 * Preferences are owned by the scoring side; NormalizedPlace is what the
 * Places wrapper hands to scoring.
 */

export type PriceLevel = 1 | 2 | 3 | 4;

/** Dietary support is only "yes"/"no" when the provider states it. Never assume. */
export type DietaryStatus = "yes" | "no" | "unknown";

export interface Preferences {
  lat: number;
  lng: number;
  radiusKm: number;
  cuisines: string[];
  priceLevels: PriceLevel[];
  dietary: string[];
  minRating?: number;
  openNow?: boolean;
  weights?: { rating: number; distance: number; match: number };
}

export interface NormalizedPlace {
  placeId: string;
  name: string;
  address: string | null;
  coords: { lat: number; lng: number };
  cuisines: string[];
  priceLevel: PriceLevel | null;
  rating: number | null;
  ratingCount: number | null;
  openNow: boolean | null;
  distanceKm: number;
  dietary: {
    vegetarian: DietaryStatus;
    vegan: DietaryStatus;
  };
}

/** The search inputs the wrapper needs (a subset of Preferences). */
export interface PlacesSearch {
  lat: number;
  lng: number;
  radiusKm: number;
  cuisines?: string[];
}

/** Raw place as returned by Places API (New) for our field mask. */
export interface RawPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  servesVegetarianFood?: boolean;
}
