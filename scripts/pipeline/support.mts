// Nearest sexual assault support for every campus, computed once and saved (the live site never calls a
// routing service). For each campus: the nearest community sexual assault support with a public address,
// and the nearest hospital with published 24-hour sexual assault or forensic nurse examiner care, chosen by
// straight-line distance on the same side of the Strait of Georgia, then routed by road with the public
// OSRM server (one request per second). If OSRM fails, the straight line is saved and labelled as such.
// Output: data/support-routes.geojson. Route data © OpenStreetMap contributors, routing by OSRM.
// Usage: npm run support-routes [-- --dry] [-- --only campus:kind,...]
//   --dry: print the picks without calling OSRM. --only: recompute just those routes and keep the rest.
import { readFileSync, writeFileSync } from "node:fs";
import { dbClient } from "../lib/db.mts";

type Entry = { id: string; type: "hospital_24h" | "centre" | "phone_only"; name: string; phone: string; island: boolean; lat?: number; lng?: number; source_url: string; service_area: string[] | null };
const data = JSON.parse(readFileSync(new URL("../../data/support-centres.json", import.meta.url), "utf8")) as { entries: Entry[] };
const ISLAND_CAMPUSES = new Set(["uvic", "camosun", "rru", "viu", "nic"]); // Vancouver Island
const DRY = process.argv.includes("--dry");
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const OUT = new URL("../../data/support-routes.geojson", import.meta.url);
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

const db = await dbClient();
const { rows: campuses } = await db.query("select slug, name, city, lat, lng from public.institutions where sector = 'public' and slug not like 'zz-%' order by slug");
await db.end();

const features: unknown[] = [];
let calls = 0;
for (const c of campuses as { slug: string; name: string; city: string; lat: number; lng: number }[]) {
  const island = ISLAND_CAMPUSES.has(c.slug);
  for (const kind of ["hospital_24h", "centre"] as const) {
    if (ONLY && !ONLY.has(`${c.slug}:${kind}`)) { const keep = previous.find((f) => f.properties.campus === c.slug && f.properties.kind === kind); if (keep) features.push(keep); continue; }
    // Only programs that serve the campus's city (hospitals serve everyone).
    const pool = mapped(kind).filter((e) => e.island === island && (!e.service_area || e.service_area.includes(c.city)));
    const best = pool.map((e) => ({ e, d: km(c, e) })).sort((x, y) => x.d - y.d)[0];
    if (!best) { console.log(`${c.slug.padEnd(15)} ${kind.padEnd(12)} none on this side of the water`); continue; }
    // A centre farther (even in a straight line) than the campus's 24-hour hospital service is never the
    // nearest support, so it isn't routed.
    const hosp = (features as { properties: { campus: string; kind: string; distance_m: number } }[]).find((f) => f.properties.campus === c.slug && f.properties.kind === "hospital_24h")
      ?? previous.find((f) => f.properties.campus === c.slug && f.properties.kind === "hospital_24h") as { properties: { distance_m: number } } | undefined;
    if (kind === "centre" && hosp && best.d * 1000 > hosp.properties.distance_m) {
      console.log(`${c.slug.padEnd(15)} ${kind.padEnd(12)} ${best.e.id.padEnd(24)} ${best.d.toFixed(1).padStart(6)} km straight, farther than the 24-hour hospital service; not routed`);
      continue;
    }
    const r = DRY ? { method: "straight" as const, distance_m: Math.round(best.d * 1000), duration_s: null, coordinates: [[c.lng, c.lat], [best.e.lng, best.e.lat]] as [number, number][] } : await route(c, best.e);
    if (!DRY) { calls++; await new Promise((res) => setTimeout(res, 1100)); }
    console.log(`${c.slug.padEnd(15)} ${kind.padEnd(12)} ${best.e.id.padEnd(24)} ${(r.distance_m / 1000).toFixed(1).padStart(6)} km ${r.duration_s != null ? `${Math.round(r.duration_s / 60)} min` : "(straight line)"}`);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: r.coordinates },
      properties: { campus: c.slug, kind, target: best.e.id, method: r.method, distance_m: r.distance_m, duration_s: r.duration_s, straight_km: Math.round(best.d * 10) / 10 },
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
  console.log(`\n${calls} OSRM requests; wrote data/support-routes.geojson (${features.length} routes)`);
}
