// Builds data/campuses.json from data/campus-sources.json: confirms each address appears on the school's own
// page (the "check" text, in the page as served, or as rendered in a browser for pages that build their content
// with JavaScript), then geocodes the address with the Province's BC Address Geocoder (geocoder.api.gov.bc.ca,
// no key) and keeps only civic-number, unit or block-level matches. Anything that fails is reported and left out.
// Usage: npm run build:campuses
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, type Browser } from "@playwright/test";

type Src = { school: string; id: string; name: string; address: string; city: string; check: string; source_url: string };
const { campuses } = JSON.parse(readFileSync(new URL("../../data/campus-sources.json", import.meta.url), "utf8")) as { campuses: Src[] };
const ISLAND = new Set(["Victoria", "North Cowichan", "Campbell River", "Port Alberni", "Port Hardy", "Langford", "Nanaimo", "Courtenay"]);
const norm = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/[–—-]/g, " ").replace(/[,.]/g, " ").replace(/\s+/g, " ").toLowerCase();

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const pages = new Map<string, string>();
let browser: Browser | null = null;
async function pageText(url: string) {
  if (pages.has(url)) return pages.get(url)!;
  let text = "";
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    text = norm(await res.text());
  } catch { /* try the browser below */ }
  pages.set(url, text);
  return text;
}
async function renderedText(url: string, want: string) {
  browser ??= await chromium.launch();
  const p = await browser.newPage({ userAgent: UA });
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Some pages fill in the address a moment after loading: wait for it (up to 15 s), then read the page.
    await p.waitForFunction((w) => document.body.innerText.replace(/[\u2013\u2014-]/g, " ").replace(/[,.]/g, " ").replace(/\s+/g, " ").toLowerCase().includes(w), want, { timeout: 15_000 }).catch(() => {});
    return norm(await p.locator("body").innerText());
  } catch { return ""; } finally { await p.close(); }
}
async function geocode(address: string) {
  const u = `https://geocoder.api.gov.bc.ca/addresses.json?addressString=${encodeURIComponent(address)}&maxResults=1&echo=true&outputSRS=4326`;
  const j = await (await fetch(u, { signal: AbortSignal.timeout(20_000) })).json();
  const f = j.features?.[0];
  if (!f) return null;
  return { lng: f.geometry.coordinates[0] as number, lat: f.geometry.coordinates[1] as number, score: f.properties.score as number, precision: f.properties.matchPrecision as string, matched: f.properties.fullAddress as string };
}

const out: unknown[] = [];
const problems: string[] = [];
for (const c of campuses) {
  const want = norm(c.check).trim();
  let seen = (await pageText(c.source_url)).includes(want);
  if (!seen) seen = (await renderedText(c.source_url, want)).includes(want);
  const g = await geocode(c.address);
  const okGeo = g && ["CIVIC_NUMBER", "BLOCK", "UNIT"].includes(g.precision) && g.score >= 80;
  const line = `${(c.school + "/" + c.id).padEnd(30)} page:${seen ? "yes" : "NO "} geo:${g ? `${g.precision} ${g.score}` : "none"}  ${g?.matched ?? ""}`;
  console.log(line);
  if (!seen || !okGeo) { problems.push(line); continue; }
  out.push({ school: c.school, id: c.id, name: c.name, address: c.address, city: c.city, lat: Math.round(g!.lat * 1e5) / 1e5, lng: Math.round(g!.lng * 1e5) / 1e5, island: ISLAND.has(c.city), source_url: c.source_url, geocoder_match: g!.matched });
  await new Promise((r) => setTimeout(r, 250));
}
await (browser as Browser | null)?.close();
writeFileSync(new URL("../../data/campuses.json", import.meta.url), JSON.stringify({
  _about: "Each school's other main campuses (data/campus-sources.json), with the address checked on the school's own page and coordinates from the BC Address Geocoder (civic number, unit or block matches only). The main campus of each school is in data/institutions.json.",
  geocoder: "https://geocoder.api.gov.bc.ca (BC Address Geocoder, Province of British Columbia, Open Government Licence - British Columbia)",
  built: new Date().toISOString().slice(0, 10),
  campuses: out,
}, null, 1) + "\n");
console.log(`\n${out.length} of ${campuses.length} campuses written.${problems.length ? `\nLeft out:\n${problems.join("\n")}` : ""}`);
