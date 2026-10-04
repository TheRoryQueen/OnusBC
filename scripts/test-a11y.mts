// Accessibility audit (WCAG 2.1 AA) of every page at 390 and 1440 px, light and dark:
// axe-core (wcag2a, wcag2aa, wcag21a, wcag21aa), 44 x 44 px tap targets for every control that isn't an
// inline text link, a visible focus ring on every tab stop, and no running animation under reduced motion.
// Signs in with a temporary zz-test school on a .test domain (no email sent); removes it after.
// Needs the dev server. Usage: npm run test:a11y [-- --verbose]
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dbClient, requireEnv } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const VERBOSE = process.argv.includes("--verbose");
const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const db = await dbClient();
const run = randomBytes(3).toString("hex");
const SLUG = "zz-test-a11y", DOMAIN = "a11ytest.test";
const findings = new Map<string, Set<string>>();
const note = (kind: string, what: string) => { if (!findings.has(kind)) findings.set(kind, new Set()); findings.get(kind)!.add(what); };

async function cleanup() {
  const { rows } = await db.query("select id from auth.users where email like '%a11ytest.test'");
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.query("delete from public.institutions where slug = $1", [SLUG]);
}
async function signedInState(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route("**/auth/v1/otp*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${BASE}/signin?next=/account`, { waitUntil: "networkidle" });
  const email = `a11y-${run}@${DOMAIN}`;
  await page.getByLabel("School email").fill(email);
  await page.getByRole("radio", { name: "Student" }).click();
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Digit 1").waitFor();
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
  const otp = (await admin.auth.admin.generateLink({ type: "magiclink", email })).data.properties?.email_otp as string;
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(otp[i]);
  await page.waitForURL((u) => u.pathname === "/account", { timeout: 20000 });
  await db.query("update public.profiles set is_judge = true where id = (select id from auth.users where email = $1)", [email]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

type Step = (page: Page) => Promise<void>;
const PAGES: { name: string; path: string; auth?: boolean; then?: Step }[] = [
  { name: "home", path: "/" },
  { name: "map", path: "/map" },
  { name: "panel", path: "/map/uvic", then: async (p) => { await p.getByRole("complementary").waitFor(); } },
  { name: "ask", path: "/map/uvic", then: async (p) => { await p.getByRole("complementary").getByRole("button", { name: "Ask", exact: true }).click(); await p.getByLabel(/Your question/).waitFor(); } },
  { name: "how-it-works", path: "/how-it-works" },
  { name: "support", path: "/support" },
  { name: "sources", path: "/sources" },
  { name: "privacy", path: "/privacy" },
  { name: "signin", path: "/signin" },
  { name: "not-found", path: "/no-such-page" },
  { name: "data", path: "/data" },
  { name: "rate", path: `/rate/${SLUG}`, auth: true },
  { name: "account", path: "/account", auth: true },
  { name: "account-privacy", path: "/account?tab=privacy", auth: true, then: async (p) => { await p.getByText("Onus keeps as little as it can about you.").waitFor(); } },
  { name: "account-delete-dialog", path: "/account?tab=privacy", auth: true, then: async (p) => { await p.getByRole("button", { name: "Delete account" }).click(); await p.getByRole("alertdialog").waitFor(); await p.waitForTimeout(300); } },
  { name: "account-reviews", path: "/account?tab=reviews", auth: true, then: async (p) => {
    await p.evaluate(() => localStorage.setItem("onus.ratings.v1", JSON.stringify([{ slug: "uvic", school: "University of Victoria", code: "ABCD2345", saved: "2026-10-03" }])));
    await p.reload({ waitUntil: "load" });
    await p.getByRole("button", { name: "Save a backup code" }).click();
    await p.getByText("Rated on another device?").click();
  } },
  { name: "campus-panel", path: "/map/sfu/surrey", then: async (p) => { await p.getByRole("complementary").getByText("Campus", { exact: true }).waitFor(); } },
  { name: "listen-strip", path: "/map/uvic", then: async (p) => {
    await p.route("**/api/report-card/**", (r) => r.fulfill({ status: 503, body: "" }));
    await p.getByRole("complementary").getByRole("button", { name: "Listen to this report card" }).click();
    await p.getByRole("button", { name: "Show the text" }).click();
  } },
  { name: "grade", path: "/grade", auth: true },
];

async function tapTargets(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    const sel = "a[href], button, input:not([type=hidden]), select, textarea, [role=radio], [role=tab], [role=button], [role=switch], summary";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (!r.width || !r.height || st.visibility === "hidden" || el.closest("[aria-hidden=true], .sr-only, .maplibregl-ctrl-attrib-inner")) continue;
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "text" && (el as HTMLInputElement).type !== "email" && (el as HTMLInputElement).type !== "url" && el.closest("label")) continue;
      // Inline text links (inside running text) are exempt.
      if (el.tagName === "A" && st.display === "inline") {
        const block = el.closest("p, li, dd, blockquote, td");
        if (block && (block.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 3) continue;
      }
      // An element counts as big enough if its own box, or a padded hit area it sits in, is 44 x 44.
      if (r.width >= 43.5 && r.height >= 43.5) continue;
      const hit = getComputedStyle(el, "::after");
      if (hit.content !== "none" && hit.position === "absolute" && parseFloat(hit.width) >= 43.5 && parseFloat(hit.height) >= 43.5) continue;
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      bad.push(`${name} (${Math.round(r.width)}x${Math.round(r.height)})`);
    }
    return bad;
  });
}

async function focusRings(page: Page, max = 40) {
  const missing: string[] = [];
  await page.locator("body").click({ position: { x: 1, y: 1 } }).catch(() => {});
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // A control may draw its ring on its own container (the map search bar), up to two levels up.
      let ring = false;
      for (const e of [el, el.parentElement, el.parentElement?.parentElement]) {
        if (!e) continue;
        const st = getComputedStyle(e);
        if ((st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0) || /rgb|#/.test(st.boxShadow) && st.boxShadow !== "none") ring = true;
      }
      const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
      return { ring, name };
    });
    if (!info) break;
    if (info.name === "NEXTJS-PORTAL") continue; // the Next.js dev overlay, not part of the site
    if (!info.ring) missing.push(info.name);
  }
  return missing;
}

await cleanup();
const { rows: [school] } = await db.query(
  `insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains, employee_domains)
   values ($1, 'Access Test College', 'college', 'Kamloops', 50.3, -119.8, true, $2, $2) returning id`, [SLUG, [DOMAIN]]);
await db.query("select public.refresh_scores($1)", [school.id]);
const browser = await chromium.launch();
let crashed = false;
try {
  const state = await signedInState(browser);
  for (const [w, h] of [[390, 844], [1440, 900]] as const) for (const scheme of ["light", "dark"] as const) {
    const contexts: Record<"anon" | "auth", BrowserContext> = {
      anon: await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 500, hasTouch: w < 500 }),
      auth: await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 500, hasTouch: w < 500, storageState: state }),
    };
    for (const pg of PAGES) {
      const page = await contexts[pg.auth ? "auth" : "anon"].newPage();
      await page.goto(`${BASE}${pg.path}`, { waitUntil: "load" });
      await page.waitForTimeout(pg.name === "map" ? 2500 : 900);
      if (pg.then) await pg.then(page);
      await page.waitForTimeout(400);
      const where = `${pg.name} ${w} ${scheme}`;
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".maplibregl-canvas").analyze();
      for (const v of axe.violations) for (const n of v.nodes) note(`axe ${v.id}`, `${where}: ${n.target.join(" ")}${VERBOSE ? ` ${n.failureSummary?.split("\n").slice(1, 2).join("")}` : ""}`);
      for (const t of await tapTargets(page)) note("tap target < 44px", `${pg.name} ${w}: ${t}`);
      if (scheme === "light") for (const f of await focusRings(page)) note("no visible focus ring", `${pg.name} ${w}: ${f}`);
      await page.close();
    }
    for (const c of Object.values(contexts)) await c.close();
  }
  // Reduced motion: nothing keeps moving.
  const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  for (const path of ["/", "/map", "/map/uvic", "/support"]) {
    const page = await rm.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getComputedTiming().iterations === Infinity || Number(a.effect?.getComputedTiming().duration) > 200)).map((a) => ((a.effect as KeyframeEffect)?.target as HTMLElement | null)?.className?.toString().slice(0, 50) ?? "?"));
    for (const m of moving) note("animates under reduced motion", `${path}: ${m}`);
    await page.close();
  }
  await rm.close();
} catch (e) {
  crashed = true;
  console.log("CRASH", (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await cleanup();
  await db.end();
}
let total = 0;
for (const [kind, set] of findings) {
  console.log(`\n## ${kind} (${set.size})`);
  for (const s of [...set].slice(0, VERBOSE ? 400 : 25)) console.log("  " + s);
  total += set.size;
}
console.log(`\n${total} findings${crashed ? " (run crashed)" : ""}`);
process.exit(total || crashed ? 1 : 0);
