import type { PlacesSearch } from "./types";

export type ParseResult = { ok: true; search: PlacesSearch } | { ok: false; error: string };

/** Parse ?lat=&lng=&radiusKm=&cuisines=italian,thai into a PlacesSearch. */
export function parseSearchParams(params: URLSearchParams): ParseResult {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const radiusKm = Number(params.get("radiusKm") ?? "5");

  if (!params.get("lat") || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "lat must be a number between -90 and 90" };
  }
  if (!params.get("lng") || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: "lng must be a number between -180 and 180" };
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
    return { ok: false, error: "radiusKm must be between 0 and 50" };
  }

  const cuisines = (params.get("cuisines") ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => /^[a-z_ ]{2,40}$/.test(c))
    .slice(0, 10);

  return { ok: true, search: { lat, lng, radiusKm, cuisines } };
}
