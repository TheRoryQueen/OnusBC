// Open data (/data): the downloads match the database exactly, parse as CSV and JSON, carry the license,
// and contain no ratings data or anything personal. Linked from the footer and Sources. Needs the dev server.
// Usage: npm run test:data
import { chromium } from "@playwright/test";
import { dbClient } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
// RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; } else f += c;
  }
  return rows;
}

const db = await dbClient();
const { rows: [{ n: nSchools }] } = await db.query("select count(*)::int n from public.institutions where sector = 'public' and slug not like 'zz-%'");
const { rows: [{ n: nGrades }] } = await db.query("select count(*)::int n from public.grades g join public.institutions i on i.id = g.institution_id where i.slug not like 'zz-%'");

const schoolsCsv = await (await fetch(`${BASE}/data/onus-schools.csv`)).text();
const criteriaRes = await fetch(`${BASE}/data/onus-criteria.csv`);
const criteriaCsv = await criteriaRes.text();
const json = await (await fetch(`${BASE}/data/onus.json`)).json();
const s = parseCsv(schoolsCsv), c = parseCsv(criteriaCsv);
check("schools CSV has one row per school", s.length - 1 === nSchools, `${s.length - 1} of ${nSchools}`);
check("criteria CSV has one row per stored grade", c.length - 1 === nGrades, `${c.length - 1} of ${nGrades}`);
check("criteria CSV downloads as a file", /attachment; filename="onus-criteria\.csv"/.test(criteriaRes.headers.get("content-disposition") ?? ""));
check("every CSV row has as many fields as the header", [s, c].every((t) => t.every((r) => r.length === t[0].length)));
check("JSON matches the CSVs and carries the license", json.schools.length === nSchools && json.criteria.length === nGrades && /Free to use with credit to Onus/.test(json.license));
const all = schoolsCsv + criteriaCsv + JSON.stringify(json);
const cols = [...s[0], ...c[0], ...Object.keys(json.schools[0]), ...Object.keys(json.criteria[0])].join(" ");
check("no ratings data", !/rating|practice|n_onus|n_sample|n_public|trust|believed|went_through|gap/i.test(cols), cols);
check("nothing personal (no emails, user ids, usernames, or contact fields)", !/@[a-z0-9-]+\.[a-z]/i.test(all.replace(/https?:\/\/\S+/g, "")) && !/user_id|username|email|contact_/i.test(cols));
// Every quote is exactly the stored, verified quote.
const { rows: stored } = await db.query("select i.slug, g.criterion_id, g.score, g.quote, g.verified from public.grades g join public.institutions i on i.id = g.institution_id where i.slug not like 'zz-%'");
const byKey = new Map(stored.map((r) => [`${r.slug}|${r.criterion_id}`, r]));
const mism = json.criteria.filter((r: { school_slug: string; criterion_id: string; score: number; quote: string | null }) => { const t = byKey.get(`${r.school_slug}|${r.criterion_id}`); return !t || t.score !== r.score || (t.quote ?? null) !== (r.quote ?? null); });
check("every score and quote matches the database exactly", mism.length === 0, `${mism.length} differ`);
check("every quote shipped is a verified one", stored.filter((r) => r.quote).every((r) => r.verified));
const uvic = json.schools.find((x: { slug: string }) => x.slug === "uvic");
check("review dates included with their source line", uvic.last_revised === "2025-07-01" && /Effective Date/.test(uvic.last_revised_quote) && uvic.next_review_by === "2028-07-01");
await db.end();

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/data`, { waitUntil: "load" });
  check("the page says it's free to use with credit", await page.getByText(/Free to use with credit to Onus/).first().isVisible());
  check("three downloads", (await page.getByRole("link", { name: "Download" }).count()) === 3);
  await page.goto(`${BASE}/sources`, { waitUntil: "load" });
  check("Sources links to the open data", (await page.getByRole("main").getByRole("link", { name: "open data", exact: true }).getAttribute("href")) === "/data");
  check("the footer links to Open data", (await page.getByRole("contentinfo").getByRole("link", { name: "Open data" }).getAttribute("href")) === "/data");
} catch (e) {
  check("page checks ran", false, (e as Error).message.split("\n")[0]);
} finally { await browser.close(); }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
