import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WEIGHTS,
  UNKNOWN_CREDIT,
  isExcluded,
  normalizeWeights,
  rankPlaces,
  scorePlace,
} from "../src/lib/recommend/score.ts";
import type { NormalizedPlace, Preferences } from "../src/lib/places/types.ts";

function place(overrides: Partial<NormalizedPlace> = {}): NormalizedPlace {
  return {
    placeId: "p1",
    name: "Test",
    address: null,
    coords: { lat: 0, lng: 0 },
    cuisines: ["italian"],
    priceLevel: 2,
    rating: 4,
    ratingCount: 100,
    openNow: true,
    distanceKm: 1,
    dietary: { vegetarian: "unknown", vegan: "unknown" },
    ...overrides,
  };
}

function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return {
    lat: 0,
    lng: 0,
    radiusKm: 5,
    cuisines: [],
    priceLevels: [],
    dietary: [],
    ...overrides,
  };
}

test("hard filters: distance, cuisine, price, rating, open now, dietary 'no'", () => {
  const p = prefs({ cuisines: ["thai"], priceLevels: [1], minRating: 4.5, openNow: true, dietary: ["vegetarian"] });
  assert.equal(isExcluded(place({ distanceKm: 6 }), prefs()), true);
  assert.equal(isExcluded(place({ cuisines: ["italian"] }), prefs({ cuisines: ["thai"] })), true);
  assert.equal(isExcluded(place({ priceLevel: 3 }), prefs({ priceLevels: [1, 2] })), true);
  assert.equal(isExcluded(place({ rating: 4.0 }), prefs({ minRating: 4.5 })), true);
  assert.equal(isExcluded(place({ openNow: false }), prefs({ openNow: true })), true);
  assert.equal(
    isExcluded(place({ dietary: { vegetarian: "no", vegan: "unknown" } }), prefs({ dietary: ["vegetarian"] })),
    true,
  );
  // A place that fits everything stays
  assert.equal(
    isExcluded(
      place({ cuisines: ["thai"], priceLevel: 1, rating: 4.8, dietary: { vegetarian: "yes", vegan: "unknown" } }),
      p,
    ),
    false,
  );
});

test("unknown fields don't exclude (null price, rating, open status, no cuisine tags)", () => {
  const p = prefs({ cuisines: ["thai"], priceLevels: [1], minRating: 4.5, openNow: true, dietary: ["gluten_free"] });
  const unknown = place({ cuisines: [], priceLevel: null, rating: null, openNow: null });
  assert.equal(isExcluded(unknown, p), false);
});

test("null fields get neutral or partial credit, never full credit", () => {
  const p = prefs({ cuisines: ["thai"], priceLevels: [1] });
  const r = scorePlace(place({ rating: null, cuisines: [], priceLevel: null }), p);
  assert.equal(r.breakdown.rating, 0.5);
  assert.equal(r.breakdown.match, UNKNOWN_CREDIT);
});

test("unknown dietary stays but is tagged unverified and not scored as safe", () => {
  const p = prefs({ dietary: ["vegetarian", "gluten_free"] });
  const verified = scorePlace(place({ dietary: { vegetarian: "yes", vegan: "unknown" } }), p);
  assert.deepEqual(verified.caveats, ["dietary_unverified:gluten_free"]);
  assert.equal(verified.breakdown.match, (1 + UNKNOWN_CREDIT) / 2);

  const unknown = scorePlace(place(), p);
  assert.deepEqual(unknown.caveats, ["dietary_unverified:vegetarian", "dietary_unverified:gluten_free"]);
  assert.equal(unknown.breakdown.match, UNKNOWN_CREDIT);
});

test("open status unknown is flagged when the user wants open now", () => {
  const r = scorePlace(place({ openNow: null }), prefs({ openNow: true }));
  assert.deepEqual(r.caveats, ["open_status_unknown"]);
  assert.deepEqual(scorePlace(place({ openNow: null }), prefs()).caveats, []);
});

test("match score defaults to neutral 0.5 when nothing is requested", () => {
  assert.equal(scorePlace(place(), prefs()).breakdown.match, 0.5);
});

test("weights are normalized; zero, negative or missing fall back to defaults", () => {
  assert.deepEqual(normalizeWeights(undefined), DEFAULT_WEIGHTS);
  assert.deepEqual(normalizeWeights({ rating: 0, distance: 0, match: 0 }), DEFAULT_WEIGHTS);
  assert.deepEqual(normalizeWeights({ rating: 2, distance: 1, match: 1 }), { rating: 0.5, distance: 0.25, match: 0.25 });
  assert.deepEqual(normalizeWeights({ rating: -1, distance: 1, match: 1 }), { rating: 0, distance: 0.5, match: 0.5 });
});

test("score uses the weights", () => {
  const r = scorePlace(place({ rating: 5, distanceKm: 0 }), prefs({ weights: { rating: 1, distance: 0, match: 0 } }));
  assert.equal(r.score, 1);
});

test("zero radius doesn't divide by zero", () => {
  const r = rankPlaces([place({ distanceKm: 0 })], prefs({ radiusKm: 0 }));
  assert.equal(r.length, 1);
  assert.ok(Number.isFinite(r[0].score));
  assert.equal(r[0].breakdown.distance, 1);
});

test("ranking: higher score first, ties broken by ratingCount then placeId", () => {
  const places = [
    place({ placeId: "b", ratingCount: 10 }),
    place({ placeId: "a", ratingCount: 10 }),
    place({ placeId: "c", ratingCount: 50 }),
    place({ placeId: "best", rating: 5 }),
  ];
  assert.deepEqual(
    rankPlaces(places, prefs()).map((p) => p.placeId),
    ["best", "c", "a", "b"],
  );
});

test("rankPlaces does not mutate its input", () => {
  const input = [place({ placeId: "z", rating: 3 }), place({ placeId: "y", rating: 5 })];
  const snapshot = structuredClone(input);
  rankPlaces(input, prefs());
  assert.deepEqual(input, snapshot);
});

test("unknown rating or price is flagged when the user filters on it", () => {
  const p = prefs({ minRating: 4, priceLevels: [1, 2] });
  assert.deepEqual(scorePlace(place({ rating: null, priceLevel: null }), p).caveats, ["price_unknown", "rating_unknown"]);
  assert.deepEqual(scorePlace(place({ rating: null, priceLevel: null }), prefs()).caveats, []);
  assert.deepEqual(scorePlace(place(), p).caveats, []);
});
