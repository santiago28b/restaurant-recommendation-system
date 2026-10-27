import { NextResponse } from "next/server";
import { BudgetExceededError } from "@/lib/places/budget";
import { PlacesApiError, getPlacesClient } from "@/lib/places/client";
import { parseSearchParams } from "@/lib/places/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/places?lat=40.23&lng=-111.66&radiusKm=5&cuisines=italian,thai
 * Returns normalized nearby restaurants, sorted by distance.
 * Filtering and ranking happen in the scoring layer, not here.
 */
export async function GET(req: Request) {
  const parsed = parseSearchParams(new URL(req.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await getPlacesClient().searchNearby(parsed.search);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof PlacesApiError) {
      console.error(err);
      return NextResponse.json({ error: "Restaurant data provider failed" }, { status: 502 });
    }
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
