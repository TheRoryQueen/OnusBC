// Grade a policy: judges and admins only; pasted links can't reach private addresses; the daily cap holds;
// a failed run shows the most recent real run, labelled as a recording; nothing reaches the BC map.
// No Gemini calls unless --live, which grades the McMaster sample once through the page (1 call) and
// takes screenshots. Uses a temporary zz-test school and .test domains; removes everything after.
// Needs the dev server. Usage: npm run test:grade [-- --live]
import { randomBytes } from "node:crypto";
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dbClient, requireEnv } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const LIVE = process.argv.includes("--live");
const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const db = await dbClient();
const run = randomBytes(3).toString("hex");
const SLUG = "zz-test-grade", DOMAIN = "gradetest.test";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
async function cleanup() {
  const { rows } = await db.query("select id from auth.users where email like '%gradetest.test'");
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.query("delete from public.institutions where slug = $1", [SLUG]);
  await db.query("delete from public.grading_runs where source_label like 'zz-test%'");
}
async function signIn(page: Page, email: string) {
  await page.route("**/auth/v1/otp*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${BASE}/signin?next=/grade`, { waitUntil: "networkidle" });
  await page.getByLabel("School email").fill(email);
  await page.getByRole("radio", { name: "Student" }).click();
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Digit 1").waitFor();
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
  const otp = (await admin.auth.admin.generateLink({ type: "magiclink", email })).data.properties?.email_otp as string;
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(otp[i]);
  await page.waitForURL((u) => u.pathname === "/grade", { timeout: 20000 });
}
const post = (page: Page, body: unknown) => page.evaluate(async (b) => {
  const r = await fetch("/api/grade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, text: await r.text() };
}, body);
const lines = (t: string) => t.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

await cleanup();
const { rows: [school] } = await db.query(
  `insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains, employee_domains)
   values ($1, 'Grade Test College', 'college', 'Kamloops', 50.3, -119.8, true, $2, $2) returning id`, [SLUG, [DOMAIN]]);
await db.query("select public.refresh_scores($1)", [school.id]);
const gradesBefore = (await db.query("select count(*)::int n, coalesce(sum(score), 0)::int s from public.grades")).rows[0];
const runsBefore = (await db.query("select count(*)::int n from public.grading_runs")).rows[0].n;
const browser = await chromium.launch();
try {
  // Signed out and signed in without access.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/grade`, { waitUntil: "load" });
  check("signed out: the page asks a judge to sign in, with no grader", await anon.getByRole("link", { name: "Sign in" }).last().isVisible() && !(await anon.getByRole("button", { name: "Grade it live" }).count()));
  check("signed out: the API refuses (401)", (await post(anon, { sample: "mcmaster" })).status === 401);
  await anon.context().close();

  // Each test run gets its own client address so the per-IP limit doesn't carry over between runs
  // (in production Vercel sets x-real-ip itself).
  const ip = { "x-real-ip": `203.0.113.${parseInt(run, 16) % 250}` };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: ip });
  const page = await ctx.newPage();
  const email = `judge-${run}@${DOMAIN}`;
  await signIn(page, email);
  check("a signed-in student without judge access is refused (403)", (await post(page, { sample: "mcmaster" })).status === 403);
  await db.query("update public.profiles set is_judge = true where id = (select id from auth.users where email = $1)", [email]);
  await page.reload({ waitUntil: "load" });
  check("a judge sees the grader", await page.getByRole("button", { name: "Grade it live" }).isVisible());
  check("both sample policies are offered", await page.getByRole("radio", { name: /McMaster/ }).isVisible() && await page.getByRole("radio", { name: /Dalhousie/ }).isVisible());

  // Pasted links: no Gemini call is made for any of these.
  for (const [u, want] of [["http://example.com/a.pdf", /https/], ["https://127.0.0.1/a.pdf", /private network/], ["https://localhost/a.pdf", /private network/], ["https://169.254.169.254/latest/meta-data", /private network/], ["https://example.com/", /isn't a PDF/]] as const) {
    const r = lines((await post(page, { url: u })).text);
    const err = r.find((e) => e.type === "error");
    check(`refuses ${u} before any model call`, !!err && want.test(err.message) && !r.some((e) => e.type === "stage" && e.stage === "grade"), err?.message);
  }
  const calls = (await db.query("select coalesce(sum(gemini_calls), 0)::int n from public.grading_runs where created_at > now() - interval '5 minutes' and status = 'failed'")).rows[0].n;
  check("those refused runs used no Gemini calls", calls === 0, String(calls));
  await db.query("update public.grading_runs set source_label = 'zz-test ' || source_label where created_at > now() - interval '5 minutes' and status = 'failed'");

  if (LIVE) {
    await page.getByRole("radio", { name: /McMaster/ }).click();
    await page.getByRole("button", { name: "Grade it live" }).click();
    await page.getByText("Read the text").waitFor();
    const first = await page.getByRole("list", { name: "Criteria" }).locator("li").first().waitFor({ timeout: 90000 }).then(() => Date.now());
    await page.getByLabel(/On paper grade/).first().waitFor({ timeout: 120000 });
    const done = Date.now();
    check("criteria appear while the model is still writing", done - first > 300, `${done - first} ms between the first criterion and the grade`);
    check("all 17 criteria are shown", (await page.getByRole("list", { name: "Criteria" }).locator("> li").count()) === 17);
    const run = (await db.query("select * from public.grading_runs where status = 'done' order by finished_at desc limit 1")).rows[0];
    check("the run used exactly one Gemini call, on the light model", run.gemini_calls === 1 && run.model === "gemini-3.5-flash-lite", `${run.gemini_calls} ${run.model}`);
    const r = run.result;
    check("every quote the model gave was checked", r.quotes_checked === r.quotes_verified + r.quotes_rejected && r.criteria.filter((c: { model_score: number }) => c.model_score > 0).length === r.quotes_checked);
    console.log(`      McMaster: ${r.paper_letter} (${r.paper_gpa}), ${r.quotes_verified} quotes verified, ${r.quotes_rejected} rejected, ${(r.ms / 1000).toFixed(0)} s`);
    await page.screenshot({ path: "screenshots/grade-1440-light.png" });
  }

  // A failed run shows the most recent real run as a recording (only if one exists).
  const recorded = (await db.query("select finished_at from public.grading_runs where status = 'done' order by finished_at desc limit 1")).rows[0];
  await page.getByRole("radio", { name: "Paste a PDF link" }).click();
  await page.getByLabel("Link to a policy PDF").fill("https://example.com/");
  await page.getByRole("button", { name: "Grade it live" }).click();
  const appAlert = page.locator("p[role=alert]");
  await appAlert.waitFor({ timeout: 30000 });
  if (recorded) {
    const label = await page.getByText(/^Recorded run from /).isVisible();
    const shown = await page.getByRole("list", { name: "Criteria" }).locator("> li").count();
    check("a failed run shows the most recent real run, labelled as a recording", label && shown === 17, `label ${label}, ${shown} criteria, alert: ${await appAlert.textContent()}`);
    // Screenshots of the recorded run (no Gemini calls: the pasted link fails before grading), each width
    // and theme in its own context, on their own client address.
    const state = await ctx.storageState();
    for (const [w, h] of [[390, 844], [1440, 900]] as const) for (const scheme of ["light", "dark"] as const) {
      const shot = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, colorScheme: scheme, storageState: state, extraHTTPHeaders: { "x-real-ip": `198.51.100.${parseInt(run, 16) % 250}` } });
      const p2 = await shot.newPage();
      await p2.goto(`${BASE}/grade`, { waitUntil: "load" });
      await p2.getByRole("radio", { name: "Paste a PDF link" }).click();
      await p2.getByLabel("Link to a policy PDF").fill("https://example.com/");
      await p2.getByRole("button", { name: "Grade it live" }).click();
      await p2.getByText(/^Recorded run from /).waitFor({ timeout: 30000 });
      await p2.screenshot({ path: `screenshots/grade-recorded-${w}-${scheme}.png`, fullPage: true });
      await shot.close();
    }
  } else check("with no recorded run yet, a failed run says so plainly", /isn't a PDF/.test(await appAlert.textContent() ?? ""));
  await db.query("update public.grading_runs set source_label = 'zz-test ' || source_label where status = 'failed' and source_label not like 'zz-test%' and created_at > now() - interval '10 minutes'");

  // The daily cap: with today's runs used up, a run is refused before anything is fetched.
  await db.query(`insert into public.grading_runs (source_kind, source_label, source_url, model, gemini_calls, status)
    select 'url', 'zz-test cap', 'https://example.com', 'test', 1, 'failed' from generate_series(1, 10)`);
  const capped = lines((await post(page, { sample: "mcmaster" })).text);
  check("past the daily cap, a run is refused before anything is fetched", capped.length === 1 && capped[0].type === "error" && /live runs are used up/.test(capped[0].message), capped[0]?.message);
  await page.reload({ waitUntil: "load" });
  check("past the cap, the button is off and the page says 0 runs left", await page.getByRole("button", { name: "Grade it live" }).isDisabled() && await page.getByText(/^0 of 10 live runs left today/).isVisible());
  await ctx.close();

  const gradesAfter = (await db.query("select count(*)::int n, coalesce(sum(score), 0)::int s from public.grades")).rows[0];
  check("nothing was added to the BC map's grades", gradesAfter.n === gradesBefore.n && gradesAfter.s === gradesBefore.s);
  check("runs are stored only in grading_runs", (await db.query("select count(*)::int n from public.grading_runs")).rows[0].n >= runsBefore);
  const anonRead = await createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")).from("grading_runs").select("id").limit(1);
  check("the public key can't read grading runs", !!anonRead.error || (anonRead.data ?? []).length === 0);
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await cleanup();
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
