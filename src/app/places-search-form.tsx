"use client";

import { useState } from "react";
import type { NormalizedPlace } from "@/lib/places/types";

const PRICE = ["", "$", "$$", "$$$", "$$$$"];

export default function PlacesSearchForm() {
  // Default: Provo, UT
  const [lat, setLat] = useState("40.2338");
  const [lng, setLng] = useState("-111.6585");
  const [radiusKm, setRadiusKm] = useState("5");
  const [cuisines, setCuisines] = useState("");
  const [places, setPlaces] = useState<NormalizedPlace[] | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function fillMyLocation() {
    navigator.geolocation?.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(5));
      setLng(pos.coords.longitude.toFixed(5));
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ lat, lng, radiusKm, cuisines });
      const res = await fetch(`/api/places?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setPlaces(data.places);
      setCached(data.cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setPlaces(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <label>
          Latitude
          <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Longitude
          <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Radius (km)
          <input value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Cuisines (comma separated)
          <input
            value={cuisines}
            onChange={(e) => setCuisines(e.target.value)}
            placeholder="italian, thai"
          />
        </label>
        <button type="button" onClick={fillMyLocation}>
          Use my location
        </button>
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {places && (
        <>
          <p className="muted">
            {places.length} places{cached ? " (from cache)" : ""}
          </p>
          <ul className="results">
            {places.map((p) => (
              <li key={p.placeId}>
                <div className="row">
                  <strong>{p.name}</strong>
                  <span className="muted">{p.distanceKm} km</span>
                </div>
                <div className="muted">
                  {[
                    p.rating !== null ? `★ ${p.rating} (${p.ratingCount ?? 0})` : null,
                    p.priceLevel ? PRICE[p.priceLevel] : null,
                    p.cuisines.join(", ") || null,
                    p.openNow === null ? null : p.openNow ? "Open now" : "Closed",
                    p.dietary.vegetarian === "yes" ? "Vegetarian options" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {p.address && <div className="muted">{p.address}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
