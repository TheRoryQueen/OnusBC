// Nearest support: the data follows the rules (official sources, no shelters, confidential locations not
// mapped), every campus routes only to support that serves its city, the site never calls a router, and
// the map and panel show it. Needs the dev server for the UI checks. Usage: npm run test:support
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import centres from "../data/support-centres.json" with { type: "json" };
import routes from "../data/support-routes.json" with { type: "json" };
import { dbClient } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
type E = { id: string; type: string; name: string; address: string | null; lat?: number; source_url: string; service_area: string[] | null };
const entries = (centres as { entries: E[] }).entries;
type F = { properties: { campus: string; kind: string; target: string; method: string; distance_m: number } };
const features = (routes as unknown as { features: F[]; attribution: string }).features;

check("every entry has an https source", entries.every((e) => /^https:\/\//.test(e.source_url)));
check("no transition houses or shelters", entries.every((e) => !/transition|shelter|safe home|women's shelter/i.test(e.name)));
check("phone-only services have no address and no map position", entries.filter((e) => e.type === "phone_only").every((e) => !e.address && e.lat == null));
check("South Peace Community Resources Society is excluded (also runs a transition house)", !entries.some((e) => /south peace/i.test(e.name)));
check("routes carry OpenStreetMap attribution", /OpenStreetMap contributors/.test((routes as unknown as { attribution: string }).attribution));
check("every route target is a mapped entry", features.every((f) => entries.some((e) => e.id === f.properties.target && e.lat != null)));

const db = await dbClient();
const { rows: campuses } = await db.query("select slug, city from public.institutions where sector = 'public' and slug not like 'zz-%'");
check("every campus has a 24-hour hospital route", campuses.every((c) => features.some((f) => f.properties.campus === c.slug && f.properties.kind === "hospital_24h")));
const outOfArea = features.filter((f) => { const e = entries.find((x) => x.id === f.properties.target)!; const city = campuses.find((c) => c.slug === f.properties.campus)?.city; return e.service_area && !e.service_area.includes(city); });
check("no campus is routed to a program whose published area excludes it", outOfArea.length === 0, outOfArea.map((f) => `${f.properties.campus}->${f.properties.target}`).join(", "));
for (const slug of ["ubc-vancouver", "langara", "vcc", "ecuad", "capilano"]) {
  const best = features.filter((f) => f.properties.campus === slug).sort((a, b) => a.properties.distance_m - b.properties.distance_m)[0];
  check(`${slug}: nearest support is VGH's 24-hour Sexual Assault Service`, best?.properties.target === "vch-vgh-sas", best?.properties.target);
}
await db.end();
let callers = "";
try { callers = execFileSync("grep", ["-rlE", "router\\.project-osrm|/route/v1/", "app", "components", "lib"], { encoding: "utf8" }).trim(); } catch { /* grep exits 1 when nothing matches */ }
check("the site never calls a routing service", callers === "", callers);

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/map/ubc-vancouver`, { waitUntil: "load" });
  await page.waitForFunction(() => { const m = (window as unknown as { __onusMap?: { getSource: (s: string) => unknown } }).__onusMap; return !!m?.getSource("support-route"); }, null, { timeout: 45000 });
  await page.waitForTimeout(800);
  const n = await page.evaluate(() => ((window as unknown as { __onusMap: { getSource: (s: string) => { serialize: () => { data: { features: unknown[] } } } } }).__onusMap.getSource("support-route").serialize().data.features.length));
  check("selecting a school draws one purple route", n === 1, String(n));
  const dots = await page.evaluate(() => ((window as unknown as { __onusMap: { getSource: (s: string) => { serialize: () => { data: { features: unknown[] } } } } }).__onusMap.getSource("support-points").serialize().data.features.length));
  check("purple dots for every mapped service", dots === entries.filter((e) => e.type !== "phone_only" && e.lat != null).length, String(dots));
  // The route draws out from the campus over about a second, like a directions app.
  await page.goto(`${BASE}/map`, { waitUntil: "load" });
  await page.waitForFunction(() => !!(window as unknown as { __onusMap?: { getSource: (s: string) => unknown } }).__onusMap?.getSource("support-route"), null, { timeout: 45000 });
  await page.evaluate(() => (document.querySelector('nav[aria-label="Schools"] a[href="/map/sfu"]') as HTMLAnchorElement).click());
  const lengths: number[] = [];
  for (let i = 0; i < 8; i++) {
    lengths.push(await page.evaluate(() => {
      const f = (window as unknown as { __onusMap: { getSource: (s: string) => { serialize: () => { data: { features: { geometry: { coordinates: unknown[] } }[] } } } } }).__onusMap.getSource("support-route").serialize().data.features[0];
      return f ? f.geometry.coordinates.length : 0;
    }));
    await page.waitForTimeout(150);
  }
  check("the route grows over time instead of appearing at once", lengths.some((n, i) => i > 0 && n > lengths[i - 1]) && lengths.at(-1)! >= Math.max(...lengths), lengths.join(","));
  await page.goto(`${BASE}/map/ubc-vancouver`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const panel = page.getByRole("complementary");
  check("the panel names the nearest support with distance and drive time", await panel.getByText("Sexual Assault Service at Vancouver General Hospital").isVisible() && await panel.getByText(/10\.3 km by road, about 18 min by car/).isVisible());
  check("call and directions links", (await panel.getByRole("link", { name: "Call Sexual Assault Service at Vancouver General Hospital" }).getAttribute("href")) === "tel:6048752881" && /^https:\/\/www\.google\.com\/maps\/dir\//.test(await panel.getByRole("link", { name: /^Directions to / }).getAttribute("href") ?? ""));
  check("Salal's 24-hour line is shown for a Vancouver campus", await panel.getByText("Salal Sexual Violence Support Centre").isVisible());
  // The info sheet: name, address, phone, Google Maps directions and website.
  await panel.getByRole("button", { name: "Sexual Assault Service at Vancouver General Hospital" }).click();
  const sheet = page.getByRole("dialog", { name: "Sexual Assault Service at Vancouver General Hospital" });
  check("tapping the support opens its info sheet", await sheet.isVisible() && await sheet.getByText("899 West 12th Avenue").isVisible());
  check("the sheet's directions open Google Maps to the published address", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Sexual%20Assault%20Service/.test(await sheet.getByRole("link", { name: "Directions" }).getAttribute("href") ?? ""));
  check("the sheet has the phone and the website", (await sheet.getByRole("link", { name: /604-875-2881/ }).getAttribute("href")) === "tel:6048752881" && !!(await sheet.getByRole("link", { name: "Website" }).getAttribute("href"))?.startsWith("https://www.vch.ca/"));
  await page.keyboard.press("Escape");
  check("Escape closes the sheet", !(await sheet.isVisible()));
  await page.goto(`${BASE}/map/capilano`, { waitUntil: "load" });
  check("Capilano shows the North Shore line", await page.getByRole("complementary").getByText(/Family Services of the North Shore/).isVisible({ timeout: 15000 }));
} catch (e) {
  check("UI checks ran", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
