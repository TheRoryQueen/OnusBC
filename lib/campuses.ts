import data from "@/data/campuses.json";

// Each school's other main campuses (data/campuses.json: addresses checked on the school's own page,
// coordinates from the BC Address Geocoder). The main campus is the school's own dot. A campus shares its
// school's panel and grade; its nearest support and hospital are computed for the campus itself.
export type Campus = { school: string; id: string; name: string; address: string; city: string; lat: number; lng: number; source_url: string };
export const CAMPUSES = (data as unknown as { campuses: Campus[] }).campuses;

export const campusesOf = (slug: string) => CAMPUSES.filter((c) => c.school === slug);
export const campusById = (slug: string, id: string | null | undefined) => (id ? CAMPUSES.find((c) => c.school === slug && c.id === id) ?? null : null);
/** The key used by the precomputed routes: the slug for a main campus, "<slug>/<campus id>" for the others. */
export const campusKey = (slug: string, id?: string | null) => (id ? `${slug}/${id}` : slug);
/** "/map/sfu" or "/map/sfu/surrey" -> { slug, campus }. */
export function parseMapPath(path: string | null) {
  const m = path?.match(/^\/map\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/);
  return { slug: m?.[1] ?? null, campus: m?.[2] ?? null };
}
