import centres from "@/data/support-centres.json";
import routes from "@/data/support-routes.json";

// Nearest sexual assault support for each campus, from data/support-centres.json (official sources only)
// and data/support-routes.json (road routes computed once with OSRM; the site never calls a router).
// The nearest support is whichever is closer by road: a community program that serves the campus's city,
// or a hospital with published 24-hour sexual assault care (which serves everyone).

export type SupportEntry = {
  id: string; type: "hospital_24h" | "centre" | "phone_only"; name: string; address: string | null; phone: string;
  phone_24h?: string; hours: string | null; serves: string; island: boolean; lat?: number; lng?: number;
  source_url: string; service_area: string[] | null;
};
type RouteFeature = {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: { campus: string; kind: "centre" | "hospital_24h"; target: string; method: "road" | "straight"; distance_m: number; duration_s: number | null };
};

export const SUPPORT: SupportEntry[] = (centres as { entries: SupportEntry[] }).entries;
const ROUTES = (routes as unknown as { features: RouteFeature[] }).features;
export const ROUTE_ATTRIBUTION = (routes as unknown as { attribution: string }).attribution;

/** Every entry with a public address and a map position (the purple dots). */
export const MAPPED = SUPPORT.filter((e) => e.type !== "phone_only" && e.lat != null && e.lng != null) as (SupportEntry & { lat: number; lng: number })[];

// Phone-only services shown with the campuses they cover (Salal for Vancouver campuses, agreed Oct 3).
const PHONE_FOR_CITY: Record<string, string[]> = { salal: ["Vancouver"] };

export type NearestSupport = {
  entry: SupportEntry & { lat: number; lng: number };
  route: RouteFeature;
  distanceKm: number; minutes: number | null; straight: boolean;
  phoneLines: SupportEntry[];
};

export function nearestSupport(slug: string, city: string | null): NearestSupport | null {
  const options = ROUTES.filter((r) => r.properties.campus === slug).sort((a, b) => a.properties.distance_m - b.properties.distance_m);
  const route = options[0];
  if (!route) return null;
  const entry = MAPPED.find((e) => e.id === route.properties.target);
  if (!entry) return null;
  const phoneLines = SUPPORT.filter((e) => e.type === "phone_only" && city && ((e.service_area ?? PHONE_FOR_CITY[e.id] ?? []).includes(city)));
  return {
    entry, route,
    distanceKm: Math.round(route.properties.distance_m / 100) / 10,
    minutes: route.properties.duration_s == null ? null : Math.max(1, Math.round(route.properties.duration_s / 60)),
    straight: route.properties.method === "straight",
    phoneLines,
  };
}

/** "18 min" or "4 h 27 min". */
export function formatDrive(minutes: number) {
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

/** Google Maps directions to the service's published address (from the campus when given, otherwise from
 *  wherever the person is). Opens Google Maps; nothing is sent until they tap. */
export function directionsUrl(to: SupportEntry, from?: { lat: number; lng: number }) {
  const dest = encodeURIComponent(to.address ? `${to.name}, ${to.address}` : `${to.lat},${to.lng}`);
  return `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ""}&destination=${dest}`;
}

export const kindLabel = (e: SupportEntry) => (e.type === "hospital_24h" ? "Hospital sexual assault care, 24 hours" : "Community sexual assault support");
export const supportById = (id: string | null) => (id ? SUPPORT.find((e) => e.id === id) ?? null : null);
