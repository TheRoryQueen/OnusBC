import data from "@/data/hospitals.json";
import routes from "@/data/hospital-routes.json";

// BC hospitals from the official DataBC dataset (data/hospitals.json): map markers and their popups.
// Name, address, phone and the health authority's emergency department status page; no hours claimed.
export type Hospital = { name: string; address: string; phone: string | null; lat: number; lng: number; website: string | null; health_authority: string; status_url: string; ed?: boolean; ed_source?: string };
const D = data as unknown as { hospitals: Hospital[]; source: string; dataset_updated: string };
export const HOSPITALS = D.hospitals.map((h, i) => ({ ...h, id: `h${i}` }));
export const HOSPITALS_SOURCE = { url: D.source, updated: D.dataset_updated };
export const HOSPITAL_MIN_ZOOM = 7;

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
/** The hospitals nearest a school, shown at any zoom while it's selected. */
export const nearestHospitals = (p: { lat: number; lng: number }, n = 3) =>
  HOSPITALS.map((h) => ({ h, d: km(p, h) })).sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.h.id);
export const hospitalById = (id: string | null) => (id ? HOSPITALS.find((h) => h.id === id) ?? null : null);

// The road route from each campus to its nearest hospital with an emergency department (data/hospital-routes.json,
// computed once with OSRM; only hospitals on a health authority's own emergency department list).
type HospitalRoute = { geometry: { type: "LineString"; coordinates: [number, number][] }; properties: { campus: string; hospital: string; method: "road" | "straight"; distance_m: number; duration_s: number | null } };
const HOSPITAL_ROUTES = (routes as unknown as { features: HospitalRoute[] }).features;
export type NearestHospital = { hospital: (typeof HOSPITALS)[number]; route: HospitalRoute; distanceKm: number; minutes: number | null; straight: boolean };
/** key: a school's slug for its main campus, or "<slug>/<campus id>". */
export function nearestHospital(key: string | null): NearestHospital | null {
  const route = key ? HOSPITAL_ROUTES.find((r) => r.properties.campus === key) : undefined;
  const hospital = route && HOSPITALS.find((h) => h.name === route.properties.hospital);
  if (!route || !hospital) return null;
  return {
    hospital, route,
    distanceKm: Math.round(route.properties.distance_m / 100) / 10,
    minutes: route.properties.duration_s == null ? null : Math.max(1, Math.round(route.properties.duration_s / 60)),
    straight: route.properties.method === "straight",
  };
}
