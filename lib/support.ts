import centres from "@/data/support-centres.json";
import routes from "@/data/support-routes.json";

// Sexual assault support for each campus, from data/support-centres.json (official sources only) and
// data/support-routes.json (road routes computed once with OSRM; the site never calls a router).
// Order in a panel:
//   1. Campuses more than 100 km from any hospital sexual assault service: the nearest hospital emergency
//      department first (any emergency department can give medical care after a sexual assault).
//   2. Local phone lines (and local programs without a map position) that cover the campus's city.
//   3. The nearest support by road: a hospital sexual assault service, or a community program that serves
//      the campus's city. This is the purple line on the map (unless 1 applies, then the line goes there).
//   4. Other routed options nearby.

export type SupportEntry = {
  id: string; type: "hospital" | "hospital_ed" | "centre" | "phone_only"; name: string; address: string | null; phone: string;
  phone_24h?: string; phone_text?: string; hours: string | null; serves: string; island: boolean; lat?: number; lng?: number;
  source_url: string; service_area: string[] | null; label: string; care_24h?: boolean; status_url?: string; ed_url?: string;
  lead_for_cities?: string[];
};
type RouteFeature = {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: { campus: string; kind: "centre" | "hospital" | "ed"; target: string; method: "road" | "straight"; distance_m: number; duration_s: number | null };
};

const DATA = centres as unknown as { entries: SupportEntry[]; ed_note: { quote: string; publisher: string; url: string } };
export const SUPPORT: SupportEntry[] = DATA.entries;
export const ED_NOTE = DATA.ed_note;
const ROUTES = (routes as unknown as { features: RouteFeature[] }).features;
export const ROUTE_ATTRIBUTION = (routes as unknown as { attribution: string }).attribution;

/** Every support entry with a public address and a map position (the purple dots). Emergency departments
 *  are hospitals, not sexual assault services, so they are drawn with the hospital markers instead. */
export const MAPPED = SUPPORT.filter((e) => (e.type === "hospital" || e.type === "centre") && e.lat != null && e.lng != null) as (SupportEntry & { lat: number; lng: number })[];

export type Option = {
  entry: SupportEntry & { lat: number; lng: number };
  route: RouteFeature;
  distanceKm: number; minutes: number | null; straight: boolean;
};
export type CampusSupport = {
  ed: Option | null;            // 1
  local: SupportEntry[];        // 2
  nearest: Option | null;       // 3
  others: Option[];             // 4
  /** The purple line: the emergency department when it leads, otherwise the nearest support. */
  line: Option | null;
};

const option = (route: RouteFeature): Option | null => {
  const entry = SUPPORT.find((e) => e.id === route.properties.target);
  if (!entry || entry.lat == null || entry.lng == null) return null;
  return {
    entry: entry as Option["entry"], route,
    distanceKm: Math.round(route.properties.distance_m / 100) / 10,
    minutes: route.properties.duration_s == null ? null : Math.max(1, Math.round(route.properties.duration_s / 60)),
    straight: route.properties.method === "straight",
  };
};

export function campusSupport(slug: string, city: string | null): CampusSupport {
  const mine = ROUTES.filter((r) => r.properties.campus === slug);
  const ed = mine.find((r) => r.properties.kind === "ed");
  const support = mine.filter((r) => r.properties.kind !== "ed").sort((a, b) => a.properties.distance_m - b.properties.distance_m).map(option).filter(Boolean) as Option[];
  const local = SUPPORT.filter((e) => city && (
    (e.type === "phone_only" && e.service_area?.includes(city)) || e.lead_for_cities?.includes(city)
  ));
  const edOption = ed ? option(ed) : null;
  const nearest = support[0] ?? null;
  return { ed: edOption, local, nearest, others: support.slice(1), line: edOption ?? nearest };
}

/** Back-compatible: the purple-line option for a campus. */
export function nearestSupport(slug: string, city: string | null) {
  const s = campusSupport(slug, city);
  return s.line ? { ...s.line, phoneLines: s.local } : null;
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

export const kindLabel = (e: SupportEntry) => e.label;
export const supportById = (id: string | null) => (id ? SUPPORT.find((e) => e.id === id) ?? null : null);
