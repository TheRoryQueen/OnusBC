// Nearest sexual assault support for every campus, computed once and saved (the live site never calls a
// routing service). For each campus: the nearest community sexual assault support with a public address,
// and the nearest hospital with published 24-hour sexual assault or forensic nurse examiner care, chosen by
// straight-line distance on the same side of the Strait of Georgia, then routed by road with the public
// OSRM server (one request per second). If OSRM fails, the straight line is saved and labelled as such.
// Output: data/support-routes.json. Route data © OpenStreetMap contributors, routing by OSRM.
// Usage: npm run support-routes [-- --dry] [-- --only campus:kind,...]
//   --dry: print the picks without calling OSRM. --only: recompute just those routes and keep the rest.
import { readFileSync, writeFileSync } from "node:fs";
import { loadCampuses } from "./campuses.mts";

type Entry = { id: string; type: "hospital" | "hospital_ed" | "centre" | "phone_only"; name: string; phone: string; island: boolean; lat?: number; lng?: number; source_url: string; service_area: string[] | null };
const data = JSON.parse(readFileSync(new URL("../../data/support-centres.json", import.meta.url), "utf8")) as { entries: Entry[] };
const DRY = process.argv.includes("--dry");
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const OUT = new URL("../../data/support-routes.json", import.meta.url);
const previous = ONLY ? (JSON.parse(readFileSync(OUT, "utf8")).features as { properties: { campus: string; kind: string } }[]) : [];

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const mapped = (t: Entry["type"]) => data.entries.filter((e) => e.type === t && e.lat != null && e.lng != null) as (Entry & { lat: number; lng: number })[];

async function route(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`, {
      headers: { "user-agent": "Onus/1.0 (onusmap.tech; one-time precompute)" }, signal: AbortSignal.timeout(20_000),
    });
    const j = await res.json();
    const r = j.routes?.[0];
    if (!res.ok || j.code !== "Ok" || !r) throw new Error(j.code ?? String(res.status));
    return { method: "road" as const, distance_m: Math.round(r.distance), duration_s: Math.round(r.duration), coordinates: r.geometry.coordinates as [number, number][] };
  } catch (e) {
    console.log(`   OSRM failed (${(e as Error).message}); using the straight line`);
    return { method: "straight" as const, distance_m: Math.round(km(a, b) * 1000), duration_s: null, coordinates: [[a.lng, a.lat], [b.lng, b.lat]] as [number, number][] };
  }
}

// Every campus: each school's main campus (key = slug) and its other main campuses (key = "<slug>/<id>").
const campuses = await loadCampuses();
// The nearest hospital emergency department by road for each campus (data/hospital-routes.json; run
// npm run hospital-routes first). A sourced emergency department entry leads a panel only when it is that
// campus's nearest one; otherwise the panel leads with the nearest one from the health authority's list.
type HRoute = { properties: { campus: string; hospital: string }; geometry: { coordinates: [number, number][] } };
const hospitalRoutes = (JSON.parse(readFileSync(new URL("../../data/hospital-routes.json", import.meta.url), "utf8")) as { features: HRoute[] }).features;

const features: unknown[] = [];
let calls = 0;
for (const c of campuses) {
  const island = c.island;
  for (const kind of ["hospital", "centre", "ed"] as const) {
    if (ONLY && !ONLY.has(`${c.key}:${kind}`)) { const keep = previous.find((f) => f.properties.campus === c.key && f.properties.kind === kind); if (keep) features.push(keep); continue; }
    const hosp = (features as { properties: { campus: string; kind: string; distance_m: number } }[]).find((f) => f.properties.campus === c.key && f.properties.kind === "hospital")
      ?? previous.find((f) => f.properties.campus === c.key && f.properties.kind === "hospital") as { properties: { distance_m: number } } | undefined;
    // Emergency departments are routed only for campuses more than 100 km from any hospital sexual assault service.
    if (kind === "ed" && (!hosp || hosp.properties.distance_m <= 100_000)) continue;
    // Only programs that serve the campus's city (hospitals serve everyone). A program whose published area
    // names the campus's city comes before one with no stated area.
    const pool = mapped(kind === "ed" ? "hospital_ed" : kind).filter((e) => e.island === island && (!e.service_area || e.service_area.includes(c.city)));
    const named = pool.filter((e) => e.service_area?.includes(c.city));
    let best = (named.length ? named : pool).map((e) => ({ e, d: km(c, e) })).sort((x, y) => x.d - y.d)[0];
    if (kind === "ed" && best) {
      const end = hospitalRoutes.find((f) => f.properties.campus === c.key)?.geometry.coordinates.at(-1);
      if (!end || km(best.e, { lng: end[0], lat: end[1] }) > 2) { console.log(`${c.key.padEnd(15)} ${kind.padEnd(12)} nearest emergency department is not a sourced entry; the panel leads with it from the health authority list`); best = undefined as unknown as typeof best; }
    }
    if (!best) { console.log(`${c.key.padEnd(15)} ${kind.padEnd(12)} none on this side of the water`); continue; }
    // A centre farther (even in a straight line) than the campus's 24-hour hospital service is never the
    // nearest support, so it isn't routed.
    // A distant centre (over 50 km, and farther than the hospital service) is never the nearest support or
    // a local one, so it isn't routed; a centre in or near the campus's town always is.
    if (kind === "centre" && !named.length && hosp && best.d * 1000 > hosp.properties.distance_m && best.d > 50) {
      console.log(`${c.key.padEnd(15)} ${kind.padEnd(12)} ${best.e.id.padEnd(24)} ${best.d.toFixed(1).padStart(6)} km straight, over 50 km and farther than the hospital service; not routed`);
      continue;
    }
    const r = DRY ? { method: "straight" as const, distance_m: Math.round(best.d * 1000), duration_s: null, coordinates: [[c.lng, c.lat], [best.e.lng, best.e.lat]] as [number, number][] } : await route(c, best.e);
    if (!DRY) { calls++; await new Promise((res) => setTimeout(res, 1100)); }
    console.log(`${c.key.padEnd(15)} ${kind.padEnd(12)} ${best.e.id.padEnd(24)} ${(r.distance_m / 1000).toFixed(1).padStart(6)} km ${r.duration_s != null ? `${Math.round(r.duration_s / 60)} min` : "(straight line)"}`);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: r.coordinates },
      properties: { campus: c.key, kind, target: best.e.id, method: r.method, distance_m: r.distance_m, duration_s: r.duration_s, straight_km: Math.round(best.d * 10) / 10 },
    });
  }
}
if (!DRY) {
  writeFileSync(OUT, JSON.stringify({
    type: "FeatureCollection",
    attribution: "Routes © OpenStreetMap contributors (openstreetmap.org/copyright), computed with the OSRM public demo server on 2026-10-03.",
    generated_at: new Date().toISOString(),
    features,
  }) + "\n");
  console.log(`\n${calls} OSRM requests; wrote data/support-routes.json (${features.length} routes)`);
}
