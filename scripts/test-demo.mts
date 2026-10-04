// The PRD demo script, end to end in a real browser, at desktop and phone size: home, Explore the map, the
// map opens On paper, open a school, expand a category with its quote, Ask the demo question, judge sign-in
// with the event code, rate a school, and a second browser sees its Onus count go 0 to 1 live.
// The rating goes to a temporary zz-test school (removed afterwards) so the demo leaves nothing on real
// schools. Ask: one real call at desktop size (the main Ask model, never gemini-3.5-flash); intercepted
// with the cached demo answer at phone size.
// Needs the dev server. Usage: npm run test:demo
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dbClient, requireEnv } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const db = await dbClient();
const run = randomBytes(3).toString("hex");
const SLUG = "zz-test-demo";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
async function cleanup() {
  const { rows } = await db.query("select id from auth.users where email like 'judge-demo-%@notaschool.test'");
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.query("delete from public.institutions where slug = $1", [SLUG]);
}
const cache = (JSON.parse(readFileSync(new URL("../data/ask-cache.json", import.meta.url), "utf8")).answers as { slug: string; question: string; answer: string; citations: unknown[] }[]).find((a) => a.slug === "ubc-vancouver")!;
const mapReady = (p: Page) => p.waitForFunction(() => {
  const m = (window as unknown as { __onusMap?: { getLayer: (id: string) => unknown; isSourceLoaded: (id: string) => boolean } }).__onusMap;
  return !!m && !!m.getLayer("school-dot") && m.isSourceLoaded("schools");
}, null, { timeout: 45000 });

await cleanup();
const { rows: [school] } = await db.query(
  `insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains) values ($1, 'Demo Test College', 'college', 'Kamloops', 50.45, -120.2, true, '{demotest.test}') returning id`, [SLUG]);
await db.query("select public.refresh_scores($1)", [school.id]);
const browser = await chromium.launch();

try {
  for (const size of [{ name: "desktop", viewport: { width: 1440, height: 900 }, mobile: false }, { name: "phone", viewport: { width: 390, height: 844 }, mobile: true }]) {
    const s = size.name;
    const ctx = await browser.newContext({ viewport: size.viewport, isMobile: size.mobile, hasTouch: size.mobile });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // 1. Home, then Explore the map.
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    check(`${s}: home opens on the dictionary entry`, await page.getByRole("heading", { name: "onus" }).isVisible());
    await page.getByRole("link", { name: "Explore the map" }).first().scrollIntoViewIfNeeded();
    await page.getByRole("link", { name: "Explore the map" }).first().click();
    await page.waitForURL((u) => u.pathname === "/map", { timeout: 20000 });
    await mapReady(page);
    check(`${s}: the map shows one legend with the grade scale`, (await page.getByRole("group", { name: "Legend" }).getByText("On paper grade").count()) === 1);

    // 2. Open a school by tapping its dot (UBC Vancouver).
    const pt = await page.evaluate(() => {
      type F = { properties: { slug: string }; geometry: { coordinates: [number, number] } };
      const m = (window as unknown as { __onusMap: { project: (ll: [number, number]) => { x: number; y: number }; getCanvas: () => HTMLCanvasElement; jumpTo: (o: unknown) => void; getSource: (id: string) => { serialize: () => { data: { features: F[] } } } } }).__onusMap;
      const f = m.getSource("schools").serialize().data.features.find((x) => x.properties.slug === "ubc-vancouver")!;
      m.jumpTo({ center: f.geometry.coordinates, zoom: 12 });
      const r = m.getCanvas().getBoundingClientRect(); const p = m.project(f.geometry.coordinates);
      return { x: r.left + p.x, y: r.top + p.y };
    });
    await page.waitForTimeout(800);
    await page.mouse.click(pt.x, pt.y);
    const panel = page.getByRole("complementary");
    const opened = await page.getByRole("heading", { name: "University of British Columbia, Vancouver" }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check(`${s}: tapping a dot opens that school's panel`, opened, page.url());
    if (size.mobile) await page.getByRole("button", { name: "Show more" }).click();

    // 3. Expand a category: its clauses and quotes, with document and section.
    const cat = panel.getByRole("button", { name: /^Survivor rights/ });
    await cat.scrollIntoViewIfNeeded();
    await cat.click();
    const text = await panel.innerText();
    check(`${s}: expanding a category shows a quoted clause with its document and section`, /“[\s\S]+”/.test(text) && /Policy, section|Procedures, section/i.test(text));

    // 4. Ask the demo question.
    if (size.mobile) await page.route("**/api/ask", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ answer: cache.answer, citations: cache.citations, refused: false, crisis: false, fallback_contact: { name: "", office: null, phone: null, email: null } }) }));
    await panel.getByRole("button", { name: "Ask", exact: true }).scrollIntoViewIfNeeded();
    await panel.getByRole("button", { name: "Ask", exact: true }).click();
    const [askRes] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/ask"), { timeout: 60000 }),
      page.getByRole("button", { name: cache.question }).click(),
    ]);
    const a = await askRes.json() as { answer: string; citations: unknown[]; refused: boolean };
    await page.waitForTimeout(400);
    check(`${s}: Ask answers the demo question with a citation chip${size.mobile ? " (intercepted)" : " (one real call)"}`, askRes.ok() && !a.refused && a.citations.length > 0 && await page.getByRole("button", { name: /Section .*, (Policy|Procedures)/ }).first().isVisible(), `${a.citations.length} citations`);
    check(`${s}: no page errors along the way`, errors.length === 0, errors.join(" | ").slice(0, 200));
    await ctx.close();

    // 5. A watcher has the test school open; a judge signs in with the event code and rates it.
    const watcher = await browser.newContext({ viewport: size.viewport, isMobile: size.mobile, hasTouch: size.mobile });
    const W = await watcher.newPage();
    await W.goto(`${BASE}/map/${SLUG}`, { waitUntil: "load" });
    await W.getByRole("complementary").waitFor();
    await W.waitForFunction(() => (window as unknown as { __onusRealtime?: string }).__onusRealtime === "SUBSCRIBED", null, { timeout: 20000 });
    const before = Number(await W.locator("[data-onus-count]").getAttribute("data-onus-count"));

    const jctx = await browser.newContext({ viewport: size.viewport, isMobile: size.mobile, hasTouch: size.mobile, extraHTTPHeaders: { "x-forwarded-for": `10.88.${size.mobile ? 2 : 1}.${run.charCodeAt(0) % 250}` } });
    const J = await jctx.newPage();
    await J.goto(`${BASE}/signin?next=${encodeURIComponent(`/rate/${SLUG}`)}`, { waitUntil: "networkidle" });
    await J.getByLabel("School email").fill(`judge-demo-${run}-${s}@notaschool.test`);
    await J.getByRole("button", { name: "Judge access" }).click();
    await J.getByLabel("Event code").fill(requireEnv("JUDGE_EVENT_CODE"));
    await J.getByRole("button", { name: "Continue as a judge" }).click();
    const atForm = await J.waitForURL((u) => u.pathname === `/rate/${SLUG}`, { timeout: 20000 }).then(() => true).catch(() => false);
    check(`${s}: judge signs in with the event code and lands on the form`, atForm, J.url());
    await J.getByRole("radiogroup", { name: "Do you know how to report here?" }).getByRole("radio", { name: "Yes" }).click();
    await J.getByRole("radiogroup", { name: "Would you trust the process?" }).getByRole("radio", { name: /^3/ }).click();
    await J.getByRole("button", { name: "Submit my rating" }).click();
    check(`${s}: the rating saves and shows its edit code`, await J.getByText("Save this code.", { exact: false }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    const live = await W.waitForFunction((b) => Number(document.querySelector("[data-onus-count]")?.getAttribute("data-onus-count")) === b + 1, before, { timeout: 15000 }).then(() => true).catch(() => false);
    check(`${s}: the watcher's Onus count goes ${before} to ${before + 1} live, no reload`, live);
    await W.screenshot({ path: `screenshots/demo-live-count-${s}.png` });
    await jctx.close(); await watcher.close();
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
