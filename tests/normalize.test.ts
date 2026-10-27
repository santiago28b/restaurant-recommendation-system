import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cuisineToPlaceType,
  normalizePlace,
  toCuisines,
  toDietary,
  toPriceLevel,
} from "../src/lib/places/normalize.ts";
import { distanceKm } from "../src/lib/places/geo.ts";
import type { RawPlace } from "../src/lib/places/types.ts";

const PROVO = { lat: 40.2338, lng: -111.6585 };

test("price enum maps to 1-4, FREE counts as 1, missing is null", () => {
  assert.equal(toPriceLevel("PRICE_LEVEL_FREE"), 1);
  assert.equal(toPriceLevel("PRICE_LEVEL_INEXPENSIVE"), 1);
  assert.equal(toPriceLevel("PRICE_LEVEL_MODERATE"), 2);
  assert.equal(toPriceLevel("PRICE_LEVEL_EXPENSIVE"), 3);
  assert.equal(toPriceLevel("PRICE_LEVEL_VERY_EXPENSIVE"), 4);
  assert.equal(toPriceLevel("PRICE_LEVEL_UNSPECIFIED"), null);
  assert.equal(toPriceLevel(undefined), null);
});

test("cuisines come from place types, generic types are skipped", () => {
  assert.deepEqual(
    toCuisines(["italian_restaurant", "restaurant", "food", "pizza_restaurant", "point_of_interest"]),
    ["italian", "pizza"],
  );
  assert.deepEqual(toCuisines(["steak_house", "fast_food_restaurant"]), ["steak"]);
  assert.deepEqual(toCuisines(undefined), []);
});

test("cuisine tag maps back to a Places type", () => {
  assert.equal(cuisineToPlaceType("italian"), "italian_restaurant");
  assert.equal(cuisineToPlaceType("Middle Eastern"), "middle_eastern_restaurant");
  assert.equal(cuisineToPlaceType("steak"), "steak_house");
});

test("dietary stays unknown unless Google says so", () => {
  assert.deepEqual(toDietary({ id: "a" }), { vegetarian: "unknown", vegan: "unknown" });
  assert.deepEqual(toDietary({ id: "a", servesVegetarianFood: true }), {
    vegetarian: "yes",
    vegan: "unknown",
  });
  assert.deepEqual(toDietary({ id: "a", servesVegetarianFood: false }), {
    vegetarian: "no",
    vegan: "unknown",
  });
  assert.deepEqual(toDietary({ id: "a", types: ["vegan_restaurant"] }), {
    vegetarian: "yes",
    vegan: "yes",
  });
});

test("normalizePlace builds the agreed shape with distance", () => {
  const raw: RawPlace = {
    id: "ChIJ123",
    displayName: { text: "Pizza Pie Cafe" },
    formattedAddress: "123 Center St, Provo, UT",
    location: { latitude: 40.2338, longitude: -111.6485 },
    types: ["pizza_restaurant", "restaurant"],
    priceLevel: "PRICE_LEVEL_MODERATE",
    rating: 4.4,
    userRatingCount: 812,
    currentOpeningHours: { openNow: true },
  };
  const p = normalizePlace(raw, PROVO);
  assert.ok(p);
  assert.equal(p.placeId, "ChIJ123");
  assert.equal(p.name, "Pizza Pie Cafe");
  assert.deepEqual(p.cuisines, ["pizza"]);
  assert.equal(p.priceLevel, 2);
  assert.equal(p.rating, 4.4);
  assert.equal(p.ratingCount, 812);
  assert.equal(p.openNow, true);
  assert.ok(p.distanceKm > 0.8 && p.distanceKm < 0.9, `distance was ${p.distanceKm}`);
  assert.deepEqual(p.dietary, { vegetarian: "unknown", vegan: "unknown" });
});

test("normalizePlace keeps missing fields null and drops places without location", () => {
  const p = normalizePlace({ id: "x", location: { latitude: 40.2338, longitude: -111.6585 } }, PROVO);
  assert.ok(p);
  assert.equal(p.rating, null);
  assert.equal(p.priceLevel, null);
  assert.equal(p.openNow, null);
  assert.equal(p.distanceKm, 0);
  assert.equal(normalizePlace({ id: "y" }, PROVO), null);
});

test("haversine distance Provo -> Salt Lake City is about 65 km", () => {
  const d = distanceKm(PROVO, { lat: 40.7608, lng: -111.891 });
  assert.ok(d > 60 && d < 66, `distance was ${d}`);
});
