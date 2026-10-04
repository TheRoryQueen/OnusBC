// Every campus that gets routes: each school's main campus (data/institutions.json, key = the school's slug)
// plus its other main campuses (data/campuses.json, key = "<slug>/<campus id>", when that file exists).
import { readFileSync, existsSync } from "node:fs";

export type Campus = { key: string; slug: string; city: string; lat: number; lng: number; island: boolean };

// Vancouver Island campuses (routing never crosses the Strait of Georgia for a "nearest" pick).
const ISLAND_SLUGS = new Set(["uvic", "camosun", "rru", "viu", "nic"]);

export async function loadCampuses(): Promise<Campus[]> {
  const inst = (JSON.parse(readFileSync(new URL("../../data/institutions.json", import.meta.url), "utf8")) as { institutions: { slug: string; sector: string; city: string; lat: number; lng: number }[] }).institutions
    .filter((i) => i.sector === "public");
  const out: Campus[] = inst.map((i) => ({ key: i.slug, slug: i.slug, city: i.city, lat: i.lat, lng: i.lng, island: ISLAND_SLUGS.has(i.slug) }));
  const extra = new URL("../../data/campuses.json", import.meta.url);
  if (existsSync(extra)) {
    const { campuses } = JSON.parse(readFileSync(extra, "utf8")) as { campuses: { school: string; id: string; city: string; lat: number; lng: number; island: boolean }[] };
    for (const c of campuses) out.push({ key: `${c.school}/${c.id}`, slug: c.school, city: c.city, lat: c.lat, lng: c.lng, island: c.island });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
