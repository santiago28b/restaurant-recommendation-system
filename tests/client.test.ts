import { test } from "node:test";
import assert from "node:assert/strict";
import { BudgetExceededError, SpendTracker } from "../src/lib/places/budget.ts";
import { TtlCache } from "../src/lib/places/cache.ts";
import {
  FIELD_MASK,
  NEARBY_SEARCH_URL,
  PlacesApiError,
  PlacesClient,
  buildRequestBody,
  cacheKey,
} from "../src/lib/places/client.ts";
import { parseSearchParams } from "../src/lib/places/validate.ts";
import type { NormalizedPlace } from "../src/lib/places/types.ts";

const SEARCH = { lat: 40.2338, lng: -111.6585, radiusKm: 5, cuisines: ["thai"] };

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const SAMPLE = {
  places: [
    {
      id: "far",
      displayName: { text: "Far Thai" },
      location: { latitude: 40.26, longitude: -111.66 },
      types: ["thai_restaurant"],
    },
    {
      id: "near",
      displayName: { text: "Near Thai" },
      location: { latitude: 40.234, longitude: -111.658 },
      types: ["thai_restaurant"],
    },
    { id: "broken" },
  ],
};

function makeClient(fetchImpl: typeof fetch, budget = new SpendTracker(10, 0.035)) {
  return new PlacesClient({
    apiKey: "test-key",
    cache: new TtlCache<NormalizedPlace[]>(60_000),
    budget,
    fetchImpl,
  });
}

test("request uses Nearby Search, field mask and cuisine types", async () => {
  const { fn, calls } = fakeFetch(SAMPLE);
  await makeClient(fn).searchNearby(SEARCH);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, NEARBY_SEARCH_URL);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["X-Goog-FieldMask"], FIELD_MASK);
  assert.equal(headers["X-Goog-Api-Key"], "test-key");
  const body = JSON.parse(calls[0].init.body as string);
  assert.deepEqual(body.includedTypes, ["thai_restaurant"]);
  assert.equal(body.locationRestriction.circle.radius, 5000);
});

test("no cuisines searches all restaurants; radius is capped at 50 km", () => {
  const body = buildRequestBody({ lat: 1, lng: 2, radiusKm: 80 });
  assert.deepEqual(body.includedTypes, ["restaurant"]);
  assert.equal(body.locationRestriction.circle.radius, 50_000);
});

test("results are normalized, invalid ones dropped, sorted by distance", async () => {
  const { fn } = fakeFetch(SAMPLE);
  const res = await makeClient(fn).searchNearby(SEARCH);
  assert.equal(res.cached, false);
  assert.deepEqual(
    res.places.map((p) => p.placeId),
    ["near", "far"],
  );
});

test("same search is served from cache without a second call", async () => {
  const { fn, calls } = fakeFetch(SAMPLE);
  const client = makeClient(fn);
  await client.searchNearby(SEARCH);
  const second = await client.searchNearby({ ...SEARCH, lat: 40.23381 });
  assert.equal(calls.length, 1);
  assert.equal(second.cached, true);
  assert.equal(second.budget.requests, 1);
});

test("cache key ignores cuisine order and case", () => {
  assert.equal(
    cacheKey({ ...SEARCH, cuisines: ["Thai", "italian"] }),
    cacheKey({ ...SEARCH, cuisines: ["italian", "thai"] }),
  );
});

test("budget cap blocks calls once reached", async () => {
  const { fn, calls } = fakeFetch(SAMPLE);
  const client = makeClient(fn, new SpendTracker(0.05, 0.035));
  await client.searchNearby(SEARCH);
  await assert.rejects(
    () => client.searchNearby({ ...SEARCH, cuisines: ["italian"] }),
    BudgetExceededError,
  );
  assert.equal(calls.length, 1);
});

test("budget resets in a new month", () => {
  let now = new Date("2026-10-31T23:00:00Z");
  const t = new SpendTracker(0.05, 0.035, () => now);
  t.record();
  assert.throws(() => t.assertCanSpend(), BudgetExceededError);
  now = new Date("2026-11-01T00:30:00Z");
  t.assertCanSpend();
  assert.equal(t.status().spentUsd, 0);
});

test("Google error becomes PlacesApiError and is not cached", async () => {
  const { fn, calls } = fakeFetch({ error: { message: "bad key" } }, 403);
  const client = makeClient(fn);
  await assert.rejects(() => client.searchNearby(SEARCH), PlacesApiError);
  await assert.rejects(() => client.searchNearby(SEARCH), PlacesApiError);
  assert.equal(calls.length, 2);
});

test("cache entries expire after the TTL", () => {
  let now = 0;
  const c = new TtlCache<number>(1000, 10, () => now);
  c.set("a", 1);
  now = 999;
  assert.equal(c.get("a"), 1);
  now = 1000;
  assert.equal(c.get("a"), undefined);
});

test("query params are validated", () => {
  const ok = parseSearchParams(
    new URLSearchParams("lat=40.2&lng=-111.6&radiusKm=3&cuisines=Thai, italian,,<script>"),
  );
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.search.cuisines, ["thai", "italian"]);
  assert.equal(parseSearchParams(new URLSearchParams("lng=1")).ok, false);
  assert.equal(parseSearchParams(new URLSearchParams("lat=95&lng=1")).ok, false);
  assert.equal(parseSearchParams(new URLSearchParams("lat=1&lng=1&radiusKm=60")).ok, false);
});
