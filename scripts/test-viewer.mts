// In-app document viewer: tapping a quote opens the exact graded copy at that passage, highlighted and in
// view, with the official source and retrieval date. Five quotes from five schools (SFU: two documents,
// one a web page; JIBC: web page), an Ask citation, the review clock, Read the policy with document tabs,
// Escape and focus, COTR never served, Sources links, lazy loading, and full screen on phones.
// Needs the dev server. Usage: npm run test:viewer
import { chromium, type Page } from "@playwright/test";
import manifest from "../data/policies/manifest.json" with { type: "json" };
import cache from "../data/ask-cache.json" with { type: "json" };
import { dbClient } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
const M = manifest as unknown as Record<string, { fetched_at: string; documents: { role: string; url: string; final_url?: string; kind: string }[] }>;
const officialUrl = (slug: string, role: string) => { const d = M[slug].documents.find((x) => x.role === role)!; return d.final_url ?? d.url; };

const db = await dbClient();
// One verified quote per school (the first in rubric order), from the requested document.
async function quoteFor(slug: string, document: "Policy" | "Procedures") {
  const { rows } = await db.query(
    `select g.quote, g.document, c.category from public.grades g join public.institutions i on i.id = g.institution_id join public.criteria c on c.id = g.criterion_id
     where i.slug = $1 and g.verified and g.quote is not null and g.document = $2 order by c.sort limit 1`, [slug, document]);
  return rows[0] as { quote: string; document: string; category: string };
}
const CASES = [
  { slug: "uvic", doc: "Policy" as const, kind: "pdf" },
  { slug: "bcit", doc: "Procedures" as const, kind: "pdf" },
  { slug: "ubc-vancouver", doc: "Policy" as const, kind: "pdf" },
  { slug: "sfu", doc: "Policy" as const, kind: "html" },
  { slug: "jibc", doc: "Policy" as const, kind: "html" },
];

async function highlighted(page: Page) {
  const dlg = page.getByRole("dialog", { name: /Policy|Procedures/ });
  await dlg.waitFor({ timeout: 20000 });
  const sel = ".onus-hl, .onus-mark";
  const ok = await page.waitForFunction((s) => document.querySelectorAll(s).length > 0, sel, { timeout: 45000 }).then(() => true).catch(() => false);
  if (!ok) return { ok: false, inView: false, dlg };
  await page.waitForTimeout(600);
  const inView = await page.evaluate((s) => { const el = document.querySelector(s)!; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, sel);
  return { ok, inView, dlg };
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  // Lazy: nothing of the viewer or PDF.js loads with the map.
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  check("PDF.js isn't loaded until a document is opened", !requests.some((u) => /pdfjs|pdf\.worker|\/api\/documents\//.test(u)));

  for (const c of CASES) {
    const q = await quoteFor(c.slug, c.doc);
    await page.goto(`${BASE}/map/${c.slug}`, { waitUntil: "load" });
    const panel = page.getByRole("complementary");
    await panel.getByRole("button", { name: new RegExp(`^${q.category}`) }).click();
    await panel.getByRole("button").filter({ hasText: q.quote.slice(0, 40) }).first().click();
    const { ok, inView, dlg } = await highlighted(page);
    const role = c.doc === "Policy" ? "policy" : "procedures";
    check(`${c.slug} (${c.kind}, ${c.doc.toLowerCase()}): the quote is highlighted and scrolled into view`, ok && inView, q.quote.slice(0, 50));
    const header = await dlg.locator("header").innerText();
    check(`${c.slug}: header shows the official source and the retrieval date`, (await dlg.getByRole("link", { name: officialUrl(c.slug, role) }).count()) === 1 && header.includes("Retrieved "));
    if (c.slug === "sfu") {
      check("sfu: tabs for its two documents", (await dlg.getByRole("tab").allInnerTexts()).join() === "Policy,Procedures");
      await dlg.getByRole("tab", { name: "Procedures" }).click();
      check("sfu: switching to the procedures opens the PDF", await page.waitForFunction(() => document.querySelectorAll('li[aria-label^="Page "]').length > 0, null, { timeout: 30000 }).then(() => true).catch(() => false));
    }
    await page.keyboard.press("Escape");
    check(`${c.slug}: Escape closes the viewer`, (await page.getByRole("dialog").count()) === 0);
  }

  // Focus goes to Close on open and back to the quote on close.
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await page.getByRole("complementary").getByRole("button", { name: "Read the policy" }).click();
  await page.getByRole("dialog").waitFor();
  check("Close is focused when the viewer opens", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Close document"));
  check("Read the policy opens at page 1", await page.waitForFunction(() => { const li = document.querySelector('li[aria-label="Page 1 of 54"], li[aria-label^="Page 1 of"]'); if (!li) return false; const r = li.getBoundingClientRect(); return r.top < innerHeight; }, null, { timeout: 30000 }).then(() => true).catch(() => false));
  await page.getByRole("button", { name: "Close document" }).click();
  check("closing returns focus to Read the policy", await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText === "Read the policy"));

  // An Ask citation (a real cached answer, served to the page so no model is called).
  const cached = (cache as { answers: { slug: string; answer: string; citations: { document: string; section: string; quote: string }[]; language?: string }[] }).answers.find((a) => a.slug === "uvic")!;
  await page.route("**/api/ask", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ answer: cached.answer, citations: cached.citations, refused: false, crisis: false, fallback_contact: { name: "University of Victoria", office: null, phone: null, email: null }, language: "en" }) }));
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await page.getByRole("complementary").getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByLabel(/Your question/).fill("If I report here, who finds out?");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Section|Policy|Procedures/ }).filter({ hasText: /Section|Policy/ }).first().click();
  await page.getByRole("button").filter({ hasText: cached.citations[0].quote.slice(0, 30) }).first().click();
  const ask = await highlighted(page);
  check("an Ask citation opens the policy at the quote, highlighted", ask.ok && ask.inView);
  await page.keyboard.press("Escape");

  // The review clock's line: highlighted, or the right page with the quote shown above it.
  await page.goto(`${BASE}/map/camosun`, { waitUntil: "load" });
  await page.getByRole("complementary").getByRole("button", { name: /Published policy last revised/ }).click();
  await page.getByRole("complementary").getByRole("button").filter({ hasText: "LAST UPDATE OR AMENDMENT" }).click();
  await page.getByRole("dialog").waitFor();
  const rc = await page.waitForFunction(() => document.querySelectorAll(".onus-hl").length > 0 || !!document.querySelector('[role="note"]'), null, { timeout: 45000 }).then(() => true).catch(() => false);
  check("the review clock line opens its page, highlighted or with the quote shown above it", rc);
  await page.keyboard.press("Escape");

  // COTR: never served.
  check("COTR's document is never served", (await page.request.get(`${BASE}/api/documents/cotr/policy`)).status() === 404 && (await page.request.get(`${BASE}/documents/cotr`)).status() === 404);
  await page.goto(`${BASE}/map/cotr`, { waitUntil: "load" });
  check("COTR's panel has no Read the policy", (await page.getByRole("complementary").getByRole("button", { name: "Read the policy" }).count()) === 0);

  // Sources: View the graded copy for every school with a public policy.
  await page.goto(`${BASE}/sources`, { waitUntil: "load" });
  const links = await page.getByRole("link", { name: "View the graded copy" }).count();
  check("Sources links the graded copy for each of the 25 schools with a public policy", links === 25, String(links));
  await page.getByRole("link", { name: "View the graded copy" }).first().click();
  await page.waitForURL(/\/documents\//, { timeout: 20000 });
  check("the graded copy page shows the document with its source", await page.waitForFunction(() => document.querySelectorAll('li[aria-label^="Page "]').length > 0 || document.querySelectorAll("article section").length > 0, null, { timeout: 30000 }).then(() => true).catch(() => false) && await page.getByText(/^Source:/).first().isVisible());
  await ctx.close();

  // Phones: full screen.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  await pp.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  await pp.getByRole("button", { name: "Show more" }).click();
  await pp.getByRole("complementary").getByRole("button", { name: "Read the policy" }).click();
  const box = await pp.getByRole("dialog").boundingBox();
  check("on a phone the viewer is full screen", !!box && Math.round(box.width) === 390 && Math.round(box.height) >= 840, JSON.stringify(box));
  await phone.close();
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
