// The road route from every campus to its nearest hospital with an emergency department, computed once and
// saved (the live site never calls a router). Hospitals come from data/hospitals.json (DataBC), only those
// with ed: true (named on the health authority's own emergency department list). For each campus the three
// nearest by straight line are routed with the public OSRM server (one request per second) and the shortest
// drive is kept, so a hospital across the water never wins on straight-line distance alone. If OSRM fails
// for all three, the nearest straight line is saved and labelled as such.
// Output: data/hospital-routes.json. Route data © OpenStreetMap contributors, routing by OSRM.
// Usage: npm run hospital-routes [-- --only key,key]   (--only: recompute just those campuses, keep the rest)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadCampuses } from "./campuses.mts";

type Hospital = { name: string; lat: number; lng: number; ed?: boolean };
const hospitals = (JSON.parse(readFileSync(new URL("../../data/hospitals.json", import.meta.url), "utf8")) as { hospitals: Hospital[] }).hospitals.filter((h) => h.ed);
const OUT = new URL("../../data/hospital-routes.json", import.meta.url);
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
type Feature = { type: "Feature"; geometry: { type: "LineString"; coordinates: [number, number][] }; properties: { campus: string; hospital: string; method: "road" | "straight"; distance_m: number; duration_s: number | null } };
const previous: Feature[] = ONLY && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).features : [];

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

let calls = 0;
async function route(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  calls++;
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`, {
      headers: { "user-agent": "Onus/1.0 (onusmap.tech; one-time precompute)" }, signal: AbortSignal.timeout(20_000),
    });
    const j = await res.json();
    const r = j.routes?.[0];
    if (!res.ok || j.code !== "Ok" || !r) throw new Error(j.code ?? String(res.status));
    return { distance_m: Math.round(r.distance), duration_s: Math.round(r.duration), coordinates: r.geometry.coordinates as [number, number][] };
  } catch (e) {
    console.log(`   OSRM failed (${(e as Error).message})`);
    return null;
  } finally {
    await new Promise((res) => setTimeout(res, 1100));
  }
}

const campuses = await loadCampuses();
const features: Feature[] = [];
for (const c of campuses) {
  if (ONLY && !ONLY.has(c.key)) { const keep = previous.find((f) => f.properties.campus === c.key); if (keep) features.push(keep); continue; }
  const near = hospitals.map((h) => ({ h, d: km(c, h) })).sort((x, y) => x.d - y.d).slice(0, 3);
  let best: Feature | null = null;
  for (const { h } of near) {
    const r = await route(c, h);
    if (r && (!best || r.duration_s < best.properties.duration_s!)) {
      best = { type: "Feature", geometry: { type: "LineString", coordinates: r.coordinates }, properties: { campus: c.key, hospital: h.name, method: "road", distance_m: r.distance_m, duration_s: r.duration_s } };
    }
  }
  if (!best) {
    const h = near[0].h;
    best = { type: "Feature", geometry: { type: "LineString", coordinates: [[c.lng, c.lat], [h.lng, h.lat]] }, properties: { campus: c.key, hospital: h.name, method: "straight", distance_m: Math.round(near[0].d * 1000), duration_s: null } };
  }
  console.log(`${c.key.padEnd(28)} ${best.properties.hospital.padEnd(52)} ${(best.properties.distance_m / 1000).toFixed(1).padStart(6)} km ${best.properties.duration_s != null ? `${Math.round(best.properties.duration_s / 60)} min` : "(straight line)"}`);
  features.push(best);
}
writeFileSync(OUT, JSON.stringify({
  type: "FeatureCollection",
  attribution: "Routes © OpenStreetMap contributors (openstreetmap.org/copyright), computed with the OSRM public demo server.",
  generated_at: new Date().toISOString(),
  features,
}) + "\n");
console.log(`\n${calls} OSRM requests; wrote data/hospital-routes.json (${features.length} routes)`);
