import { SpendTracker, type BudgetStatus } from "./budget";
import { TtlCache } from "./cache";
import { cuisineToPlaceType, normalizePlace } from "./normalize";
import type { NormalizedPlace, PlacesSearch, RawPlace } from "./types";

export const NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";

/** Only the fields we use. Fewer fields = cheaper SKU. */
export const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.priceLevel",
  "places.rating",
  "places.userRatingCount",
  "places.currentOpeningHours.openNow",
  "places.servesVegetarianFood",
].join(",");

/** Places Nearby Search caps the radius at 50 km and returns at most 20 results. */
const MAX_RADIUS_M = 50_000;
const MAX_RESULTS = 20;

export class PlacesApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Places API error ${status}: ${body.slice(0, 300)}`);
    this.name = "PlacesApiError";
  }
}

export interface SearchResult {
  places: NormalizedPlace[];
  cached: boolean;
  budget: BudgetStatus;
}

export interface PlacesClientOptions {
  apiKey: string;
  cache: TtlCache<NormalizedPlace[]>;
  budget: SpendTracker;
  fetchImpl?: typeof fetch;
}

/** Same search -> same key. Rounds coords (~100 m) so tiny GPS jitter still hits cache. */
export function cacheKey(s: PlacesSearch): string {
  const cuisines = [...(s.cuisines ?? [])].map((c) => c.toLowerCase()).sort();
  return [s.lat.toFixed(3), s.lng.toFixed(3), s.radiusKm.toFixed(1), cuisines.join("|")].join(
    ":",
  );
}

export function buildRequestBody(s: PlacesSearch) {
  const types = s.cuisines?.length ? s.cuisines.map(cuisineToPlaceType) : ["restaurant"];
  return {
    includedTypes: types,
    maxResultCount: MAX_RESULTS,
    rankPreference: "POPULARITY",
    locationRestriction: {
      circle: {
        center: { latitude: s.lat, longitude: s.lng },
        radius: Math.min(Math.max(s.radiusKm, 0.1) * 1000, MAX_RADIUS_M),
      },
    },
  };
}

export class PlacesClient {
  private fetchImpl: typeof fetch;

  constructor(private opts: PlacesClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Nearby restaurants for a search. Uses the cache first; checks the budget before calling Google. */
  async searchNearby(search: PlacesSearch): Promise<SearchResult> {
    const key = cacheKey(search);
    const hit = this.opts.cache.get(key);
    if (hit) return { places: hit, cached: true, budget: this.opts.budget.status() };

    this.opts.budget.assertCanSpend();

    const res = await this.fetchImpl(NEARBY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.opts.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(buildRequestBody(search)),
    });

    // Count every call that reached Google, even failed ones (conservative).
    this.opts.budget.record();

    if (!res.ok) throw new PlacesApiError(res.status, await res.text());

    const data = (await res.json()) as { places?: RawPlace[] };
    const origin = { lat: search.lat, lng: search.lng };
    const places = (data.places ?? [])
      .map((p) => normalizePlace(p, origin))
      .filter((p): p is NormalizedPlace => p !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    this.opts.cache.set(key, places);
    return { places, cached: false, budget: this.opts.budget.status() };
  }
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

let singleton: PlacesClient | null = null;

/** Server-side client built from env vars (see .env.example). */
export function getPlacesClient(env: NodeJS.ProcessEnv = process.env): PlacesClient {
  if (singleton) return singleton;
  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  singleton = new PlacesClient({
    apiKey,
    cache: new TtlCache(num(env.PLACES_CACHE_TTL_SECONDS, 86_400) * 1000),
    budget: new SpendTracker(
      num(env.PLACES_MONTHLY_BUDGET_USD, 50),
      num(env.PLACES_COST_PER_REQUEST_USD, 0.035),
    ),
  });
  return singleton;
}
