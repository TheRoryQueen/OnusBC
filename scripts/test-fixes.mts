// Regression checks for the pre-launch fixes: sign-in can't redirect off the site; a signed-in person with a
// missing role is asked for it instead of looping; Victoria's schools clear the map legend and crowded dots
// zoom in when tapped; the map shows crisis numbers; support search knows short names; tap-to-call keeps
// extensions. Uses a temporary zz-test school and .test domains (no email sent); removes everything after.
// Needs the dev server. Usage: npm run test:fixes
import { randomBytes } from "node:crypto";
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { safeNext } from "../lib/safe-next.ts";
import { telHref } from "../lib/tel.ts";
import { dbClient, requireEnv } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const db = await dbClient();
const run = randomBytes(3).toString("hex");
const SLUG = "zz-test-fixes", DOMAIN = "fixestest.test";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
async function cleanup() {
  const { rows } = await db.query("select id from auth.users where email like '%fixestest.test'");
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.query("delete from public.institutions where slug = $1", [SLUG]);
}
async function signIn(page: Page, email: string, next: string, role?: string) {
  await page.route("**/auth/v1/otp*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${BASE}/signin?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await page.getByLabel("School email").fill(email);
  if (role) await page.getByRole("radio", { name: role }).click();
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Digit 1").waitFor();
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
  const otp = (await admin.auth.admin.generateLink({ type: "magiclink", email })).data.properties?.email_otp as string;
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(otp[i]);
}

// Offline: the redirect guard and the phone links.
for (const bad of ["/\\evil.example", "//evil.example", "/\\/evil.example", "https://evil.example", "/\t/evil.example", "javascript:alert(1)"]) {
  check(`safeNext refuses ${JSON.stringify(bad)}`, safeNext(bad) === "/map", safeNext(bad));
}
check("safeNext keeps a real path and its query", safeNext("/rate/uvic?x=1") === "/rate/uvic?x=1");
check("tap-to-call keeps the extension (Royal Roads)", telHref("250.391.2600 ext. 8514") === "tel:2503912600,8514", telHref("250.391.2600 ext. 8514"));
check("tap-to-call without an extension is unchanged", telHref("604-822-1588") === "tel:6048221588");

await cleanup();
const { rows: [school] } = await db.query(
  `insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains, employee_domains)
   values ($1, 'Fixes Test College', 'college', 'Kamloops', 50.3, -119.8, true, $2, $2) returning id`, [SLUG, [DOMAIN]]);
await db.query("select public.refresh_scores($1)", [school.id]);
const browser = await chromium.launch();
try {
  // 1. Sign-in with a crafted next goes to the map, not off the site.
  {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, `ann-${run}@${DOMAIN}`, "/\\evil.example", "Student");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2500);
    const u = new URL(page.url());
    check("sign-in with next=/\\evil.example stays on Onus", u.origin === BASE && u.pathname === "/map", page.url());
    await page.context().close();
  }

  // 2. A signed-in person missing their role gets asked for it, then lands on the form (no loop).
  {
    const page = await (await browser.newContext()).newPage();
    const email = `ben-${run}@${DOMAIN}`;
    await signIn(page, email, `/rate/${SLUG}`, "Staff");
    await page.waitForURL((u) => u.pathname === `/rate/${SLUG}`, { timeout: 20000 });
    await db.query("update public.profiles set role = null where id = (select id from auth.users where email = $1)", [email]);
    await page.goto(`${BASE}/rate/${SLUG}`, { waitUntil: "load" });
    await page.getByRole("link", { name: "choose your role or campus" }).click();
    const finish = await page.getByRole("heading", { name: "Finish signing in" }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check("missing role: /signin asks for it instead of redirecting in a loop", finish && new URL(page.url()).pathname === "/signin");
    await page.getByRole("radio", { name: "Student" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    const back = await page.waitForURL((u) => u.pathname === `/rate/${SLUG}`, { timeout: 20000 }).then(() => true).catch(() => false);
    check("after choosing, they land on the rating form", back && await page.getByRole("button", { name: "Submit my rating" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    const { rows: [p] } = await db.query("select role from public.profiles where id = (select id from auth.users where email = $1)", [email]);
    check("the role is saved", p.role === "student", p.role);
    await page.context().close();
  }

  // 3. Map on a laptop: Victoria's schools clear the legend; crisis numbers are on the map; a crowded spot zooms in.
  {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(`${BASE}/map`, { waitUntil: "load" });
    await page.waitForFunction(() => { const m = (window as unknown as { __onusMap?: { isSourceLoaded: (s: string) => boolean; getLayer: (l: string) => unknown } }).__onusMap; return !!m && !!m.getLayer("school-dot") && m.isSourceLoaded("schools"); }, null, { timeout: 45000 });
    // The caption is the last row of the legend, docked bottom-left; no Victoria school may sit under it.
    const caption = await page.getByRole("group", { name: "Legend" }).locator("xpath=..").boundingBox();
    const dots = await page.evaluate(() => {
      type F = { properties: { slug: string }; geometry: { coordinates: [number, number] } };
      const m = (window as unknown as { __onusMap: { project: (c: [number, number]) => { x: number; y: number }; getCanvas: () => HTMLCanvasElement; getSource: (s: string) => { serialize: () => { data: { features: F[] } } } } }).__onusMap;
      const r = m.getCanvas().getBoundingClientRect();
      return m.getSource("schools").serialize().data.features.filter((f) => ["uvic", "camosun", "rru"].includes(f.properties.slug)).map((f) => ({ slug: f.properties.slug, x: r.left + m.project(f.geometry.coordinates).x, y: r.top + m.project(f.geometry.coordinates).y }));
    });
    check("Victoria's schools are clear of the legend and caption at the start", !!caption && dots.length === 3 && dots.every((d) => d.x > caption.x + caption.width + 6 || d.y < caption.y - 6), dots.map((d) => `${d.slug} ${Math.round(d.x)},${Math.round(d.y)}`).join(", ") + ` | legend right ${Math.round((caption?.x ?? 0) + (caption?.width ?? 0))}`);
    check("the map shows the crisis line", await page.getByRole("link", { name: "Call 911." }).first().isVisible());
    const vic = await page.evaluate(() => {
      type F = { properties: { slug: string }; geometry: { coordinates: [number, number] } };
      const m = (window as unknown as { __onusMap: { project: (c: [number, number]) => { x: number; y: number }; getCanvas: () => HTMLCanvasElement; getZoom: () => number; getSource: (s: string) => { serialize: () => { data: { features: F[] } } } } }).__onusMap;
      const r = m.getCanvas().getBoundingClientRect(); const f = m.getSource("schools").serialize().data.features.find((x) => x.properties.slug === "uvic")!;
      const p = m.project(f.geometry.coordinates); return { x: r.left + p.x, y: r.top + p.y, zoom: m.getZoom() };
    });
    await page.mouse.click(vic.x, vic.y);
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => (window as unknown as { __onusMap: { getZoom: () => number } }).__onusMap.getZoom());
    check("tapping a crowded spot (Victoria) zooms in instead of opening a random school", new URL(page.url()).pathname === "/map" && after > vic.zoom + 1, `${vic.zoom.toFixed(1)} -> ${after.toFixed(1)}`);
    await page.context().close();
  }

  // 4. Phone: the crisis line shows on the map too.
  {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    await page.goto(`${BASE}/map`, { waitUntil: "load" });
    check("phone: the map shows the crisis line", await page.getByRole("link", { name: "Call 911." }).first().isVisible());
    await page.context().close();
  }

  // 5. Support search knows short names; the panel's contact phone keeps an extension.
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/support`, { waitUntil: "load" });
    for (const q of ["UBC", "SFU", "BCIT", "UVic"]) {
      await page.getByLabel("Find your school").fill(q);
      const n = await page.locator("ul li p.text-\\[17px\\]").count();
      check(`support search finds "${q}"`, n >= 1, `${n} schools`);
    }
    await page.goto(`${BASE}/map/rru`, { waitUntil: "load" });
    await page.getByRole("complementary").waitFor();
    check("Royal Roads' contact phone dials the extension", (await page.getByRole("complementary").locator('a[href="tel:2503912600,8514"]').count()) >= 1);
    await page.context().close();
  }
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await cleanup();
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
