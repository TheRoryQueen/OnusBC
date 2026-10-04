// "Listen to this report card": every school's summary is built from stored data only and says exactly what
// the panel shows; the panel has the Listen button and a readable transcript. No voice calls unless --live
// (one school's audio, fetched twice to show the second comes from cache). Usage: npm run test:report-card
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { reportCardText } from "../lib/report-card.ts";
import { reviewFor } from "../lib/review-clock.ts";
import type { InstitutionDetail } from "../lib/types.ts";
import { requireEnv } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok || process.argv.includes("--verbose")) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
const db = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
const { data } = await db.from("institutions").select("slug, name, policy_found, contact_office, contact_phone, institution_scores(paper_gpa, paper_letter), grades(score, criteria(category))").eq("sector", "public").not("slug", "like", "zz-%");
type Row = { slug: string; name: string; policy_found: boolean; contact_office: string | null; contact_phone: string | null; institution_scores: { paper_gpa: number | null; paper_letter: string | null } | { paper_gpa: number | null; paper_letter: string | null }[] | null; grades: { score: number; criteria: { category: string } | { category: string }[] }[] };
const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] : x);
for (const r of (data ?? []) as Row[]) {
  const sc = one(r.institution_scores);
  const school = { ...r, scores: sc ? { ...sc } : null, grades: r.grades.map((g) => ({ score: g.score, category: one(g.criteria)!.category })) } as unknown as InstitutionDetail;
  const spoken = reportCardText(school), written = reportCardText(school, { spoken: false });
  check(`${r.slug}: no em dashes`, !/—/.test(spoken + written));
  if (sc?.paper_letter) {
    check(`${r.slug}: grade matches the panel (${sc.paper_letter}, ${Math.round(Number(sc.paper_gpa))})`, written.includes(` ${sc.paper_letter}, ${Math.round(Number(sc.paper_gpa))} out of 100`), written.slice(0, 120));
    const cats = new Map<string, number[]>();
    for (const g of school.grades) cats.set(g.category, [...(cats.get(g.category) ?? []), g.score]);
    const scores = [...cats].map(([c, s]) => [c, (s.reduce((a, b) => a + b, 0) / (2 * s.length)) * 100] as const);
    const best = Math.max(...scores.map((x) => x[1])), worst = Math.min(...scores.map((x) => x[1]));
    check(`${r.slug}: names a top-scoring category as strongest`, scores.some(([c, v]) => v === best && written.includes(`strongest category is ${c}`)));
    check(`${r.slug}: names a lowest-scoring category as weakest`, scores.some(([c, v]) => v === worst && written.includes(`weakest is ${c}`)));
    const rv = reviewFor(r.slug);
    check(`${r.slug}: review clock wording`, rv.date ? /last revised/.test(written) && (!/has passed/.test(written) || /may have reviewed it without publishing/.test(written)) : /does not publish a revision date/.test(written));
    check(`${r.slug}: never claims the school broke the law`, !/broke|violat|illegal|breach/i.test(written));
  } else check(`${r.slug}: no grade without a public policy`, /no On paper grade/.test(written));
  check(`${r.slug}: ends with how to get support`, /VictimLinkBC any time at 1-800-563-0808/.test(written) && /call 911\.$/.test(written));
  check(`${r.slug}: spoken version reads numbers digit by digit`, /1 8 0 0, 5 6 3, 0 8 0 8/.test(spoken));
}

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext()).newPage();
  let audioRequests = 0;
  page.on("request", (req) => { if (req.url().includes("/api/report-card/")) audioRequests++; });
  await page.goto(`${BASE}/map/uvic`, { waitUntil: "load" });
  const panel = page.getByRole("complementary");
  check("the panel has the Listen button in its action row", await panel.getByRole("button", { name: "Listen to this report card" }).isVisible());
  check("the panel has no Call button and no Read the summary link", (await panel.getByRole("link", { name: "Call", exact: true }).count()) === 0 && (await panel.getByText("Read the summary").count()) === 0);
  check("no audio is fetched until Listen is tapped", audioRequests === 0);
  // The audio is answered here (no ElevenLabs call in tests); the strip then offers the transcript.
  await page.route("**/api/report-card/**", (r) => r.fulfill({ status: 503, body: "" }));
  await panel.getByRole("button", { name: "Listen to this report card" }).click();
  await panel.getByRole("button", { name: "Show the text" }).click();
  check("after Listen, the transcript is one tap away", await panel.getByText(/University of Victoria\. On paper, its sexual violence policy gets a B/).isVisible());
} catch (e) {
  check("UI checks ran", false, (e as Error).message.split("\n")[0]);
} finally { await browser.close(); }

if (process.argv.includes("--live")) {
  const t1 = Date.now(); const a = await fetch(`${BASE}/api/report-card/uvic`); const b1 = await a.arrayBuffer(); const ms1 = Date.now() - t1;
  const t2 = Date.now(); const b = await fetch(`${BASE}/api/report-card/uvic`); const b2 = await b.arrayBuffer(); const ms2 = Date.now() - t2;
  check("live: audio is MP3", a.headers.get("content-type") === "audio/mpeg" && b1.byteLength > 10000);
  check("live: the second request is served from cache (same bytes, fast)", b2.byteLength === b1.byteLength && ms2 < 1000, `${ms1} ms then ${ms2} ms`);
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
