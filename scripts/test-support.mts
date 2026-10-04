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
check("organizations that run a transition house, shelter or safe home appear only as phone lines, never with an address or map dot", entries.filter((e) => /ksan|haven|tillicum|south peace|castlegar and district|nelson community/i.test(e.name)).every((e) => e.type === "phone_only" && !e.address && e.lat == null));
check("routes carry OpenStreetMap attribution", /OpenStreetMap contributors/.test((routes as unknown as { attribution: string }).attribution));
check("every route target is a mapped entry", features.every((f) => entries.some((e) => e.id === f.properties.target && e.lat != null)));

const db = await dbClient();
const { rows: campuses } = await db.query("select slug, city from public.institutions where sector = 'public' and slug not like 'zz-%'");
check("every campus has a hospital sexual assault service route", campuses.every((c) => features.some((f) => f.properties.campus === c.slug && f.properties.kind === "hospital")));
type H = E & { care_24h?: boolean; label?: string; hours?: string | null };
const hospitals = entries.filter((e) => e.type === "hospital") as H[];
check("'24 hours' only where the service itself is sourced as 24-hour (VCH, Fraser Health)", hospitals.filter((h) => /24 hours/.test(h.label ?? "")).every((h) => h.care_24h) && hospitals.filter((h) => h.care_24h).map((h) => h.id).sort().join() === "fh-abbotsford-regional,fh-surrey-memorial,vch-vgh-sas");
check("Island Health hospitals are sourced to Island Health's current page, not the 2021 release", hospitals.filter((h) => h.id.startsWith("ih-") && h.source_url.includes("islandhealth")).every((h) => !h.source_url.includes("news-releases") && !h.care_24h));
// Northern rule: more than 100 km from any hospital sexual assault service -> nearest emergency department first.
for (const [slug, ed] of [["cnc", "nh-uhnbc"], ["unbc", "nh-uhnbc"], ["coast-mountain", "nh-ksyen"], ["nlc", "nh-dcdh"]] as const) {
  const f = features.find((x) => x.properties.campus === slug && x.properties.kind === "ed");
  check(`${slug}: routed to its nearest emergency department (${ed})`, f?.properties.target === ed, f?.properties.target);
}
check("no other campus gets an emergency-department route", features.filter((x) => x.properties.kind === "ed").length === 4);
const doug = features.find((x) => x.properties.campus === "douglas" && x.properties.kind === "centre");
check("Douglas College (New Westminster) uses Cameray, which names New Westminster in its service area", doug?.properties.target === "cameray-sas", doug?.properties.target);
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
  check("purple dots for every mapped service", dots === entries.filter((e) => (e.type === "hospital" || e.type === "centre") && e.lat != null).length, String(dots));
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
  // Hospitals (DataBC): crosses from zoom 7, the three nearest the selected school at any zoom, and a popup.
  await page.goto(`${BASE}/map/ubc-vancouver`, { waitUntil: "load" });
  await page.waitForFunction(() => !!(window as unknown as { __onusMap?: { getLayer: (l: string) => unknown } }).__onusMap?.getLayer("hospital-near"), null, { timeout: 45000 });
  await page.waitForTimeout(800);
  const near = await page.evaluate(() => JSON.stringify((window as unknown as { __onusMap: { getFilter: (l: string) => unknown } }).__onusMap.getFilter("hospital-near")));
  check("the three hospitals nearest the selected school show at any zoom", (near.match(/"h\d+"/g) ?? []).length === 3, near);
  const minz = await page.evaluate(() => (window as unknown as { __onusMap: { getLayer: (l: string) => { minzoom: number } } }).__onusMap.getLayer("hospital").minzoom);
  check("all hospitals show only past province level (zoom 7)", minz === 7, String(minz));
  await page.goto(`${BASE}/map`, { waitUntil: "load" });
  await page.waitForFunction(() => !!(window as unknown as { __onusMap?: { getLayer: (l: string) => unknown } }).__onusMap?.getLayer("hospital"), null, { timeout: 45000 });
  await page.evaluate(() => (window as unknown as { __onusMap: { jumpTo: (o: object) => void } }).__onusMap.jumpTo({ center: [-123.05, 49.24], zoom: 10.5 }));
  await page.waitForTimeout(1500);
  const hp = await page.evaluate(() => {
    type M = { queryRenderedFeatures: (o: object) => { geometry: { coordinates: [number, number] } }[]; project: (c: [number, number]) => { x: number; y: number }; getCanvas: () => HTMLCanvasElement };
    const m = (window as unknown as { __onusMap: M }).__onusMap; const r = m.getCanvas().getBoundingClientRect();
    const pts = m.queryRenderedFeatures({ layers: ["hospital"] }).map((f) => m.project(f.geometry.coordinates)).filter((q) => q.x > 450 && q.x < 780 && q.y > 320 && q.y < 760);
    return pts[0] ? { x: r.left + pts[0].x, y: r.top + pts[0].y } : null;
  });
  if (hp) await page.mouse.click(hp.x, hp.y);
  const hs = page.getByRole("dialog");
  check("a hospital popup gives the address, phone and emergency department status link", !!hp && await hs.getByText(/^Hospital · /).isVisible() && await hs.getByRole("link", { name: "Emergency department status" }).isVisible() && !/24 hours/.test(await hs.innerText()));

  // Panels: the order of support for northern and far-from-a-centre campuses.
  const panelText = async (slug: string) => { await page.goto(`${BASE}/map/${slug}`, { waitUntil: "load" }); const p = page.getByRole("complementary"); await p.getByRole("heading", { name: "Nearest support" }).waitFor(); return (await p.locator('section[aria-labelledby="support-heading"]').innerText()); };
  for (const [slug, first] of [["cnc", "University Hospital of Northern British Columbia"], ["unbc", "University Hospital of Northern British Columbia"], ["coast-mountain", "Ksyen Regional Hospital"], ["nlc", "Dawson Creek and District Hospital"]] as const) {
    const t = await panelText(slug);
    const body = t.replace(/^Nearest support\s*/, "");
    check(`${slug}: the panel leads with the nearest emergency department, its address, phone and the sourced line`, body.indexOf(first) > -1 && body.indexOf(first) < 120 && /Go to a hospital, a walk-in clinic, or your doctor/.test(t) && /Emergency department status/.test(t));
  }
  for (const [slug, lead] of [["selkirk", "Nelson Community Services"], ["viu", "Nanaimo RCMP Victim Services"], ["nic", "Comox Valley RCMP Victim Services"], ["cotr", "Summit Community Services Society"]] as const) {
    const t = (await panelText(slug)).replace(/^Nearest support\s*/, "");
    check(`${slug}: the panel leads with the local line (${lead})`, t.startsWith(lead), t.slice(0, 60));
  }
  for (const [slug, line] of [["coast-mountain", "Ksan Society, Sexual Assault Support Services"], ["nlc", "South Peace Community Resources Society"]] as const) {
    const t = await panelText(slug);
    check(`${slug}: the local phone line (${line}) shows right after the emergency department`, t.indexOf(line) > -1 && t.indexOf(line) < t.indexOf("Prince George Sexual Assault Centre"));
  }
  const viu = await panelText("viu");
  check("viu: Haven's 24/7 crisis line and Tillicum Lelum's victim services are listed by phone", /Haven Society, Community Victim Services/.test(viu) && /1-888-756-0616/.test(viu) && /Tillicum Lelum/.test(viu));
  check("selkirk: CDCSS victim services is listed by phone", /Castlegar and District Community Services Society/.test(await panelText("selkirk")));
  const nic = await panelText("nic");
  check("nic: Comox Valley Family Services is listed nearby", /Comox Valley Family Services/.test(nic));
  // Free counselling: Here2Talk and the school's own counselling page in every panel.
  const counselling = (await import("../data/counselling.json", { with: { type: "json" } })).default as { schools: Record<string, string> };
  check("every school has its own counselling link", campuses.every((c) => counselling.schools[c.slug]?.startsWith("https://")), campuses.filter((c) => !counselling.schools[c.slug]).map((c) => c.slug).join(","));
  let shown = 0;
  for (const c of campuses) {
    await page.goto(`${BASE}/map/${c.slug}`, { waitUntil: "load" });
    const sec = page.getByRole("complementary").locator('section[aria-labelledby="counselling-heading"]');
    await sec.waitFor({ timeout: 15000 });
    const ok = (await sec.getByRole("link", { name: "Call Here2Talk" }).getAttribute("href")) === "tel:18778573397"
      && (await sec.getByRole("link", { name: /^Counselling at / }).getAttribute("href")) === counselling.schools[c.slug];
    if (ok) shown++; else check(`${c.slug}: free counselling section`, false);
  }
  check(`all ${campuses.length} panels show Here2Talk (1-877-857-3397) and the school's counselling page`, shown === campuses.length, `${shown}`);
} catch (e) {
  check("UI checks ran", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
