# Restaurant Recommendation System

Recommends restaurants based on location, cuisine, budget and diet.
Stack: Next.js (App Router) + TypeScript, Supabase (Postgres), Google Places API (New), deployed on Vercel.

## Run it

```bash
npm install
cp .env.example .env.local   # add your GOOGLE_PLACES_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # unit tests for the Places wrapper
```

## What's here

| Path | What it does |
| --- | --- |
| `src/lib/places/types.ts` | Shared shapes: `Preferences`, `NormalizedPlace` |
| `src/lib/places/client.ts` | Calls Places Nearby Search, with cache and spending cap |
| `src/lib/places/normalize.ts` | Turns a raw Google place into a `NormalizedPlace` |
| `src/lib/places/cache.ts` | In-memory TTL cache (24h default) |
| `src/lib/places/budget.ts` | Monthly USD spending cap for Places calls |
| `src/app/api/places/route.ts` | `GET /api/places?lat=&lng=&radiusKm=&cuisines=` |
| `src/app/page.tsx` | Simple search page to try the API |

## Places data rules

- **Price:** Google's enum mapped to 1–4 (`FREE` and `INEXPENSIVE` → 1). Missing → `null`.
- **Cuisines:** taken from place types, e.g. `italian_restaurant` → `italian`.
- **Diet:** `vegetarian` is `yes`/`no` only when Google says so (`servesVegetarianFood`, or a vegetarian/vegan restaurant type). `vegan` is `yes` only for vegan restaurants. Everything else stays `unknown`. Never treat unknown as safe.
- **distanceKm:** computed from the search point.
- The wrapper does **not** filter or rank. That's the scoring layer's job.

## Cost control

- Same search (rounded to ~100 m) is served from cache for `PLACES_CACHE_TTL_SECONDS`.
- Calls stop once estimated spend hits `PLACES_MONTHLY_BUDGET_USD` (API returns 429).
- Both live in server memory, per instance. Also set a daily quota on the Places API in Google Cloud Console as a hard limit.

## Who owns what

- Santiago: scaffold, Google Places integration.
- Samir: scoring, preferences schema, Supabase data model.
