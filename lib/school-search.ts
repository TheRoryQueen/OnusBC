import type { InstitutionSummary } from "@/lib/types";

// Matching for the map's school search: short names (UBC, SFU, BCIT), the full name, the city, and the
// initials of the name, so "kwantlen", "ufv", "Fraser Valley" and "Prince George" all find something.
export type SearchResult = { href: string; title: string; detail: string; score: number };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["of", "the", "and", "de", "a"]);
const initials = (name: string) => norm(name).split(" ").filter((w) => !STOP.has(w)).map((w) => w[0]).join("");

function score(q: string, fields: { short: string; name: string; city: string }) {
  const short = norm(fields.short), name = norm(fields.name), city = norm(fields.city);
  if (!q) return 0;
  if (short === q) return 100;
  if (short.startsWith(q)) return 90 - (short.length - q.length);
  if (initials(fields.name) === q.replace(/ /g, "")) return 85;
  if (name.startsWith(q)) return 80;
  if (name.split(" ").some((w) => w.startsWith(q))) return 70;
  if (name.includes(q)) return 60;
  if (city.startsWith(q)) return 50;
  if (q.split(" ").every((w) => name.includes(w) || city.includes(w) || short.startsWith(w))) return 40;
  return 0;
}

export function searchSchools(schools: InstitutionSummary[], query: string): SearchResult[] {
  const q = norm(query);
  if (!q) return [];
  return schools
    .map((s) => ({ href: `/map/${s.slug}`, title: s.name, detail: [s.short_name, s.city].filter(Boolean).join(", "), score: score(q, { short: s.short_name ?? "", name: s.name, city: s.city ?? "" }) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
