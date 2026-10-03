// Milestone 5 checks in a real browser: dots coloured by gap, filters, clicking a dot opens the panel with
// real grades, /map/[slug] deep links and the back button, the phone bottom sheet, the theme switch,
// and live updates from Supabase Realtime. Needs the dev server (npm run dev); uses the dev-only map hook.
// Usage: npm run test:map
import { chromium, type Page } from "@playwright/test";
import { dbClient } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};

type Feat = { slug: string; color: string; label: string };
async function features(page: Page): Promise<Feat[]> {
  return page.evaluate(() => {
    const m = (window as unknown as { __onusMap: { getSource: (id: string) => { _data?: unknown; serialize?: () => { data: unknown } } } }).__onusMap;
    const src = m.getSource("schools");
    const data = (src?.serialize?.().data ?? src?._data) as { features: { properties: Feat }[] };
    return data.features.map((f) => f.properties);
  });
}
async function mapReady(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as unknown as { __onusMap?: { getSource: (id: string) => unknown; loaded: () => boolean } }).__onusMap;
    return !!m && !!m.getSource("schools") && m.loaded();
  }, null, { timeout: 30000 });
}
const css = (page: Page, v: string) => page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);

const db = await dbClient();
const browser = await chromium.launch();
try {
  // Desktop, light.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/map`, { waitUntil: "load" });
  await mapReady(page);

  const all = await features(page);
  const total = (await db.query("select count(*)::int n from public.institutions where sector = 'public'")).rows[0].n;
  check("every school has a dot", all.length === total, `${all.length} of ${total}`);

  // Dots coloured by gap: each dot's colour is the token for its gap label.
  const rows = (await db.query("select i.slug, i.policy_found, s.gap_label from public.institutions i left join public.institution_scores s on s.institution_id = i.id")).rows;
  const tokenFor = (r: { policy_found: boolean; gap_label: string | null }) =>
    !r.policy_found || r.gap_label === "no_policy" ? "--onus-no-policy"
    : r.gap_label === "aligned" || r.gap_label === "better_in_practice" ? "--onus-brand"
    : r.gap_label === "some_gap" ? "--onus-some-gap" : r.gap_label === "big_gap" ? "--onus-big-gap" : "--onus-text-secondary";
  const tokens: Record<string, string> = {};
  for (const t of ["--onus-no-policy", "--onus-brand", "--onus-some-gap", "--onus-big-gap", "--onus-text-secondary"]) tokens[t] = await css(page, t);
  const wrong = all.filter((f) => { const r = rows.find((x) => x.slug === f.slug); return !r || f.color !== tokens[tokenFor(r)]; });
  check("each dot is coloured by its gap label", wrong.length === 0, wrong.map((w) => w.slug).join(","));
  check("no-public-policy schools are grey (COTR)", all.find((f) => f.slug === "cotr")?.color === tokens["--onus-no-policy"]);

  // Filters.
  const colleges = (await db.query("select count(*)::int n from public.institutions where type = 'college'")).rows[0].n;
  await page.getByRole("radio", { name: "Colleges" }).click();
  await page.waitForTimeout(300);
  check("College filter shows only colleges (institutes included)", (await features(page)).length === colleges, `${(await features(page)).length} of ${colleges}`);
  await page.getByRole("radio", { name: "Universities" }).click();
  await page.waitForTimeout(300);
  check("University filter shows only universities", (await features(page)).length === total - colleges);
  await page.getByRole("radio", { name: "All" }).click();
  await page.getByRole("radio", { name: "On paper" }).click();
  await page.waitForTimeout(300);
  const paper = await features(page);
  const uvicLetter = (await db.query("select s.paper_letter from public.institution_scores s join public.institutions i on i.id = s.institution_id where i.slug = 'uvic'")).rows[0].paper_letter;
  check("On paper mode labels each graded dot with its letter", paper.find((f) => f.slug === "uvic")?.label === uvicLetter, `uvic ${uvicLetter}`);
  check("On paper mode doesn't use gap colours", paper.every((f) => ![tokens["--onus-brand"], tokens["--onus-some-gap"], tokens["--onus-big-gap"]].includes(f.color)));
  await page.getByRole("radio", { name: "The gap" }).click();

  // Clicking a dot opens the panel with real grades.
  const pt = await page.evaluate(() => {
    const m = (window as unknown as { __onusMap: { project: (ll: [number, number]) => { x: number; y: number }; getCanvas: () => HTMLCanvasElement } }).__onusMap;
    const r = m.getCanvas().getBoundingClientRect();
    const p = m.project([-120.36403, 50.67245]); // TRU, Kamloops, a dot with no near neighbours
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForURL(/\/map\/tru$/, { timeout: 10000 }).catch(() => {});
  check("clicking a dot opens that school's panel and URL", page.url().endsWith("/map/tru") && await page.getByRole("heading", { name: "Thompson Rivers University" }).isVisible(), page.url());

  // Deep link to a graded school: real grades and a verified quote with its document and section.
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await page.getByRole("heading", { name: "University of Victoria" }).waitFor();
  const uvic = (await db.query("select s.paper_letter, s.paper_gpa from public.institution_scores s join public.institutions i on i.id = s.institution_id where i.slug = 'uvic'")).rows[0];
  const panel = page.getByRole("complementary", { name: "University of Victoria" });
  check("deep link /map/uvic opens the panel", await panel.isVisible());
  check("panel shows the stored On paper grade", (await panel.textContent())?.includes(`${Number(uvic.paper_gpa).toFixed(2)} of 4`) ?? false, `${uvic.paper_letter} ${uvic.paper_gpa}`);
  await panel.getByRole("button", { name: /Survivor rights/ }).click();
  const q = (await db.query("select g.quote, g.document, g.section from public.grades g join public.institutions i on i.id = g.institution_id where i.slug = 'uvic' and g.criterion_id = 'SR-2'")).rows[0];
  check("expanding a category shows the verified quote", (await panel.textContent())?.includes(q.quote) ?? false);
  check("the quote is labelled with its document and section", (await panel.textContent())?.includes(`${q.document}, section ${q.section}`) ?? false, `${q.document}, section ${q.section}`);
  check("panel shows the rating counts by source", (await panel.textContent())?.includes("public records") ?? false);

  // Ungraded and no-policy schools.
  await page.goto(`${BASE}/map/sfu`, { waitUntil: "load" });
  check("ungraded school says Grading in progress", await page.getByText("Grading in progress").first().isVisible());
  await page.goto(`${BASE}/map/cotr`, { waitUntil: "load" });
  check("COTR shows the login note", await page.getByText("Policy exists but requires a login to read").isVisible());
  await page.goto(`${BASE}/map/not-a-school`, { waitUntil: "load" });
  check("unknown school shows the not-found page", await page.getByText("This page isn't here.").isVisible());

  // Back button.
  await page.goto(`${BASE}/map`, { waitUntil: "load" });
  await mapReady(page);
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await page.goBack();
  await page.waitForTimeout(800);
  check("back button returns to the map with the panel closed", page.url().endsWith("/map") && !(await page.getByRole("complementary").count()));

  // Close button.
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForURL(/\/map$/);
  check("close button closes the panel", page.url().endsWith("/map"));

  // Live update: change a score in the database; the dot recolours without a reload.
  await mapReady(page);
  const uvicId = (await db.query("select id from public.institutions where slug = 'uvic'")).rows[0].id;
  await db.query("update public.institution_scores set gap_label = 'big_gap' where institution_id = $1", [uvicId]);
  const live = await page.waitForFunction((red) => {
    const m = (window as unknown as { __onusMap: { getSource: (id: string) => { serialize: () => { data: { features: { properties: { slug: string; color: string } }[] } } } } }).__onusMap;
    return m.getSource("schools").serialize().data.features.find((f) => f.properties.slug === "uvic")?.properties.color === red;
  }, tokens["--onus-big-gap"], { timeout: 15000 }).then(() => true).catch(() => false);
  check("a score change in Supabase recolours the dot live (Realtime, no reload)", live);
  await db.query("select public.refresh_scores($1)", [uvicId]); // restore the real values

  // Theme switch swaps the basemap.
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await page.waitForTimeout(2500);
  const dark = await page.evaluate(() => JSON.stringify((window as unknown as { __onusMap: { getStyle: () => { name?: string; sprite?: unknown } } }).__onusMap.getStyle().sprite));
  check("dark mode switches the basemap to Dark Matter", /dark-matter/.test(dark), dark.slice(0, 80));
  check("no page errors on desktop", errors.length === 0, errors.join(" | "));
  await ctx.close();

  // Phone: bottom sheet with a grabber, half height then full.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", hasTouch: true, isMobile: true });
  const p2 = await phone.newPage();
  await p2.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  const sheet = p2.getByRole("complementary", { name: "University of Victoria" });
  await sheet.waitFor();
  const h1 = (await sheet.boundingBox())?.height ?? 0;
  await p2.getByRole("button", { name: "Show more" }).click();
  await p2.waitForTimeout(500);
  const h2 = (await sheet.boundingBox())?.height ?? 0;
  check("phone: panel is a bottom sheet at about half height", h1 > 300 && h1 < 520, `${Math.round(h1)} px`);
  check("phone: the grabber expands it to full height", h2 > 700, `${Math.round(h2)} px`);
  const hw = await p2.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  check("phone: no horizontal scrolling", hw);
  await phone.close();
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
