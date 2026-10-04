import data from "@/data/hospitals.json";

// BC hospitals from the official DataBC dataset (data/hospitals.json): map markers and their popups.
// Name, address, phone and the health authority's emergency department status page; no hours claimed.
export type Hospital = { name: string; address: string; phone: string | null; lat: number; lng: number; website: string | null; health_authority: string; status_url: string };
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
