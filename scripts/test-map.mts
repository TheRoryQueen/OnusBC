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

type Feat = { slug: string; fill: string; outline: string; ring: boolean; ringWidth: number; ringOffset: number; ringColor: string };
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
    // The schools layer is drawn and clickable; basemap tiles may still be arriving (they don't matter here).
    const m = (window as unknown as { __onusMap?: { getSource: (id: string) => unknown; getLayer: (id: string) => unknown; isSourceLoaded: (id: string) => boolean } }).__onusMap;
    return !!m && !!m.getSource("schools") && !!m.getLayer("school-dot") && m.isSourceLoaded("schools");
  }, null, { timeout: 45000 });
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

  // One map, no view toggle: fill = On paper grade, ring = the gap once there are 5 real ratings.
  check("there is no view toggle", (await page.getByRole("radiogroup", { name: "What the map shows" }).count()) === 0 && (await page.getByRole("radio", { name: "The gap" }).count()) === 0);
  check("no letters are drawn on the map", !(await page.evaluate(() => !!(window as unknown as { __onusMap: { getLayer: (l: string) => unknown } }).__onusMap.getLayer("school-letter"))));
  await page.waitForTimeout(300);
  const all = await features(page);
  const total = (await db.query("select count(*)::int n from public.institutions where sector = 'public'")).rows[0].n;
  check("every school has a dot", all.length === total, `${all.length} of ${total}`);

  // Fill by On paper grade; COTR (no public policy) is hollow.
  const rows = (await db.query("select i.slug, i.policy_found, s.paper_letter, s.gap_label, s.n_onus, s.n_public from public.institutions i left join public.institution_scores s on s.institution_id = i.id")).rows;
  const tokens: Record<string, string> = {};
  for (const t of ["--onus-no-policy", "--onus-page", "--onus-text", "--onus-some-gap", "--onus-big-gap", "--onus-info", "--onus-text-secondary", "--onus-grade-a", "--onus-grade-b", "--onus-grade-c", "--onus-grade-d", "--onus-grade-f"]) tokens[t] = await css(page, t);
  const wrongFill = all.filter((f) => { const r = rows.find((x) => x.slug === f.slug); return !r || (r.policy_found && r.paper_letter && f.fill !== tokens[`--onus-grade-${r.paper_letter.toLowerCase()}`]); });
  check("each dot is filled by its On paper grade", wrongFill.length === 0, wrongFill.map((w) => w.slug).join(","));
  const cotr = all.find((f) => f.slug === "cotr");
  check("no-public-policy schools are hollow (COTR)", cotr?.fill === tokens["--onus-page"] && cotr?.outline === tokens["--onus-no-policy"]);
  // The ring: only with at least 5 real ratings (Onus + public records), never counting sample ratings.
  const shouldRing = rows.filter((r) => r.policy_found && ["aligned", "some_gap", "big_gap", "better_in_practice"].includes(r.gap_label) && r.n_onus + r.n_public >= 5).map((r) => r.slug).sort();
  const ringed = all.filter((f) => f.ring).map((f) => f.slug).sort();
  check("rings only where a school has 5 or more real ratings", JSON.stringify(ringed) === JSON.stringify(shouldRing), `ringed: ${ringed.join(",") || "none"}`);
  const ubc = all.find((f) => f.slug === "ubc-vancouver")!;
  const ubcRow = rows.find((r) => r.slug === "ubc-vancouver")!;
  if (ubcRow.gap_label === "some_gap") check("UBC Vancouver: some gap is a 3 px ink ring touching the dot", ubc.ring && ubc.ringWidth === 3 && ubc.ringColor === tokens["--onus-text"] && ubc.ringOffset === 1.25);
  check("sample-only schools get no ring (UVic: 3 public records)", !all.find((f) => f.slug === "uvic")?.ring);

  // Filters.
  const colleges = (await db.query("select count(*)::int n from public.institutions where type = 'college'")).rows[0].n;
  await page.getByRole("radio", { name: "Colleges" }).click();
  await page.waitForTimeout(300);
  check("College filter shows only colleges (institutes included)", (await features(page)).length === colleges, `${(await features(page)).length} of ${colleges}`);
  await page.getByRole("radio", { name: "Universities" }).click();
  await page.waitForTimeout(300);
  check("University filter shows only universities", (await features(page)).length === total - colleges);
  await page.getByRole("radio", { name: "All" }).click();

  // Clicking a dot opens the panel with real grades.
  const pt = await page.evaluate(() => {
    const m = (window as unknown as { __onusMap: { project: (ll: [number, number]) => { x: number; y: number }; getCanvas: () => HTMLCanvasElement } }).__onusMap;
    const r = m.getCanvas().getBoundingClientRect();
    const p = m.project([-120.36403, 50.67245]); // TRU, Kamloops, a dot with no near neighbours
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForURL(/\/map\/tru$/, { timeout: 10000 }).catch(() => {});
  // The URL changes first; the panel streams in behind its loading boundary, so wait for it.
  const truPanel = await page.getByRole("heading", { name: "Thompson Rivers University" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  check("clicking a dot opens that school's panel and URL", page.url().endsWith("/map/tru") && truPanel, page.url());

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
  // Every real school is graded now, so a temporary one (policy found, no grades) stands in.
  await db.query("delete from public.institutions where slug = 'zz-test-ungraded'");
  const { rows: [tmp] } = await db.query(`insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains)
    values ('zz-test-ungraded', 'Test Ungraded College', 'college', 'Kamloops', 50.2, -119.9, true, '{ungraded.test}') returning id`);
  await db.query("select public.refresh_scores($1)", [tmp.id]);
  await page.goto(`${BASE}/map/zz-test-ungraded`, { waitUntil: "load" });
  check("ungraded school says Grading in progress", await page.getByText("Grading in progress").first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
  await db.query("delete from public.institutions where slug = 'zz-test-ungraded'");
  await page.goto(`${BASE}/map/cotr`, { waitUntil: "load" });
  check("COTR shows the login note", await page.getByText("Policy exists but requires a login to read").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
  await page.goto(`${BASE}/map/not-a-school`, { waitUntil: "load" });
  check("unknown school shows the not-found page", await page.getByText("This page isn't here.").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));

  // Back button.
  await page.goto(`${BASE}/map`, { waitUntil: "load" });
  await mapReady(page);
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await page.goBack();
  await page.waitForTimeout(800);
  check("back button returns to the map with the panel closed", page.url().endsWith("/map") && !(await page.getByRole("complementary").count()));

  // Close button.
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForURL(/\/map$/);
  check("close button closes the panel", page.url().endsWith("/map"));

  // Live update: change a score in the database; the dot recolours without a reload (gap view).
  await mapReady(page);
  await page.waitForFunction(() => (window as unknown as { __onusRealtime?: string }).__onusRealtime === "SUBSCRIBED", null, { timeout: 20000 });
  const uvicId = (await db.query("select id from public.institutions where slug = 'uvic'")).rows[0].id;
  await db.query("update public.institution_scores set paper_letter = 'A' where institution_id = $1", [uvicId]);
  const live = await page.waitForFunction((a) => {
    const m = (window as unknown as { __onusMap: { getSource: (id: string) => { serialize: () => { data: { features: { properties: { slug: string; fill: string } }[] } } } } }).__onusMap;
    return m.getSource("schools").serialize().data.features.find((f) => f.properties.slug === "uvic")?.properties.fill === a;
  }, tokens["--onus-grade-a"], { timeout: 15000 }).then(() => true).catch(() => false);
  check("a grade change in Supabase reshades the dot live (Realtime, no reload)", live);
  await db.query("select public.refresh_scores($1)", [uvicId]); // restore the real values

  // Theme switch swaps the basemap.
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await page.waitForTimeout(2500);
  const dark = await page.evaluate(() => JSON.stringify((window as unknown as { __onusMap: { getStyle: () => { name?: string; sprite?: unknown } } }).__onusMap.getStyle().sprite));
  check("dark mode switches the basemap to Dark Matter", /dark-matter/.test(dark), dark.slice(0, 80));
  check("no page errors on desktop", errors.length === 0, errors.join(" | "));
  await ctx.close();

  // Globe when zoomed all the way out, flat when zoomed in; still applied after a theme switch.
  {
    const p3 = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p3.goto(`${BASE}/map`, { waitUntil: "load" });
    await mapReady(p3);
    const projAt = async (z: number) => p3.evaluate(async (z) => {
      const m = (window as unknown as { __onusMap: { jumpTo: (o: unknown) => void; style: { projection: { name: string; transitionState?: number } }; once: (e: string, f: () => void) => void } }).__onusMap;
      m.jumpTo({ zoom: z, center: [-123, 52] });
      await new Promise<void>((r) => m.once("render", () => r()));
      return { name: m.style.projection.name, t: m.style.projection.transitionState };
    }, z);
    const out = await projAt(1), mid = await projAt(2.75), inn = await projAt(6);
    check("zoomed all the way out: globe projection", out.name.includes("globe") && (out.t ?? 1) > 0.99, JSON.stringify(out));
    check("in between: blending from globe to flat", (mid.t ?? 0) > 0 && (mid.t ?? 1) < 1, JSON.stringify(mid));
    check("zoomed in: flat", (inn.t ?? 0) < 0.01, JSON.stringify(inn));
    await p3.getByRole("button", { name: /switch to dark mode/i }).click();
    await p3.waitForTimeout(2500);
    check("dark mode keeps the globe when zoomed out", (await projAt(1)).name.includes("globe"));
    await p3.context().close();
  }

  // Clicking flies to the school (about 1 s, campus zoom); closing eases out about 2 zoom levels.
  {
    const p4 = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p4.goto(`${BASE}/map`, { waitUntil: "load" });
    await mapReady(p4);
    const z0 = await p4.evaluate(() => (window as unknown as { __onusMap: { getZoom: () => number } }).__onusMap.getZoom());
    const pt = await p4.evaluate(() => {
      const m = (window as unknown as { __onusMap: { project: (ll: [number, number]) => { x: number; y: number }; getCanvas: () => HTMLCanvasElement } }).__onusMap;
      const r = m.getCanvas().getBoundingClientRect(); const p = m.project([-120.36403, 50.67245]);
      return { x: r.left + p.x, y: r.top + p.y };
    });
    await p4.mouse.click(pt.x, pt.y);
    // The flight starts when the route changes; wait for it to start, then sample it mid-way.
    await p4.waitForFunction(() => (window as unknown as { __onusMap: { isMoving: () => boolean } }).__onusMap.isMoving(), null, { timeout: 10000 }).catch(() => {});
    await p4.waitForTimeout(300);
    const [zMid, moving] = await p4.evaluate(() => { const m = (window as unknown as { __onusMap: { getZoom: () => number; isMoving: () => boolean } }).__onusMap; return [m.getZoom(), m.isMoving()] as const; });
    // flyTo arcs (it can pull back slightly before diving in), so check it is mid-flight, not the zoom.
    check("clicking a school flies to it (still in flight 0.3 s after it starts)", moving && zMid < 12.9, `zoom ${z0.toFixed(1)} -> ${zMid.toFixed(1)}, moving=${moving}`);
    await p4.waitForTimeout(1200);
    const z1 = await p4.evaluate(() => (window as unknown as { __onusMap: { getZoom: () => number } }).__onusMap.getZoom());
    check("the flight ends at about campus zoom within ~1.5 s", Math.abs(z1 - 13) < 0.05, z1.toFixed(2));
    await p4.getByRole("button", { name: "Close", exact: true }).click();
    // Wait for the navigation back to /map, then for the ease out to start and finish.
    await p4.waitForURL((u) => u.pathname === "/map", { timeout: 10000 });
    await p4.waitForFunction(() => (window as unknown as { __onusMap: { getZoom: () => number; isMoving: () => boolean } }).__onusMap.getZoom() < 12.9, null, { timeout: 5000 }).catch(() => {});
    await p4.waitForFunction(() => !(window as unknown as { __onusMap: { isMoving: () => boolean } }).__onusMap.isMoving(), null, { timeout: 5000 }).catch(() => {});
    const z2 = await p4.evaluate(() => (window as unknown as { __onusMap: { getZoom: () => number } }).__onusMap.getZoom());
    check("closing the panel eases out about 2 zoom levels", Math.abs(z1 - z2 - 2) < 0.1, `${z1.toFixed(1)} -> ${z2.toFixed(1)}`);
    await p4.context().close();
  }

  // Reduced motion: no flying, straight there.
  {
    const p5 = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })).newPage();
    await p5.goto(`${BASE}/map`, { waitUntil: "load" });
    await mapReady(p5);
    await p5.evaluate(() => (window as unknown as { next: { router: { push: (u: string, o: unknown) => void } } }).next.router.push("/map/tru", { scroll: false }));
    await p5.getByRole("complementary", { name: "Thompson Rivers University" }).waitFor();
    await p5.waitForTimeout(120);
    const z = await p5.evaluate(() => (window as unknown as { __onusMap: { getZoom: () => number; isMoving: () => boolean } }).__onusMap.getZoom());
    check("reduced motion: jumps straight to the school, no flight", Math.abs(z - 13) < 0.05, z.toFixed(2));
    await p5.context().close();
  }

  // Phone: bottom sheet. Opens at half height; swipe up expands, swipe down collapses, a strong swipe
  // down from half closes; tapping the grabber toggles.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", hasTouch: true, isMobile: true });
  const p2 = await phone.newPage();
  await p2.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  const sheet = p2.getByRole("complementary", { name: "University of Victoria" });
  await sheet.waitFor();
  const height = async () => { await p2.waitForTimeout(450); return (await sheet.boundingBox())?.height ?? 0; };
  const swipe = async (fromY: number, toY: number) => {
    await p2.mouse.move(195, fromY); await p2.mouse.down();
    for (let i = 1; i <= 8; i++) await p2.mouse.move(195, fromY + ((toY - fromY) * i) / 8);
    await p2.mouse.up();
  };
  const h1 = await height();
  check("phone: opens as a bottom sheet at about half height", h1 > 300 && h1 < 520, `${Math.round(h1)} px`);
  const top1 = (await sheet.boundingBox())!.y;
  await swipe(top1 + 120, top1 - 200);
  const h2 = await height();
  check("phone: swipe up expands to full height", h2 > 700, `${Math.round(h2)} px`);
  await swipe((await sheet.boundingBox())!.y + 12, (await sheet.boundingBox())!.y + 300);
  const h3 = await height();
  check("phone: swipe down on the grabber collapses to half", h3 > 300 && h3 < 520, `${Math.round(h3)} px`);
  await p2.getByRole("button", { name: "Show more" }).click();
  const h4 = await height();
  check("phone: tapping the grabber still expands", h4 > 700, `${Math.round(h4)} px`);
  await p2.getByRole("button", { name: "Show less" }).click();
  await height(); // let the 300 ms collapse finish before measuring where the sheet starts
  const top2 = (await sheet.boundingBox())!.y;
  await swipe(top2 + 60, top2 + 300);
  check("phone: a strong swipe down from half closes the panel", await p2.waitForURL((u) => u.pathname === "/map", { timeout: 5000 }).then(() => true).catch(() => false));
  await p2.goto(`${BASE}/map/tru`, { waitUntil: "load" });
  const h5 = (await p2.getByRole("complementary").boundingBox())?.height ?? 0;
  check("phone: opening another school starts at half height", h5 > 300 && h5 < 520, `${Math.round(h5)} px`);
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
