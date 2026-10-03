// Milestone 7 checks in real browsers: sign in, rate (both steps), receive the edit code, and watch a
// second browser's map panel tick its Onus count and pulse the dot live (Realtime, no reload). Then the
// code changes and withdraws the rating, and the count ticks back. Also: signed-out redirect, wrong
// school, no free text, nothing linking the rating to the account.
// Uses a temporary zz-test school and .test domains (no email sent); removes everything afterwards.
// Needs the dev server. Usage: npm run test:rate
import { randomBytes } from "node:crypto";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dbClient, requireEnv } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const db = await dbClient();
const run = randomBytes(3).toString("hex");
const SLUG = "zz-test-rate";
const DOMAIN = "student.ratetest.test";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
async function cleanup() {
  const { rows } = await db.query("select id from auth.users where email like '%ratetest.test'");
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.query("delete from public.institutions where slug like 'zz-test-rate%'");
}
const onPath = (page: Page, path: string) => page.waitForURL((u) => u.pathname === path, { timeout: 20000 }).then(() => true).catch(() => false);

// Real sign-in through the page; only the "send code" request is intercepted (no email is sent).
async function signIn(browser: Browser, email: string, next: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route("**/auth/v1/otp*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${BASE}/signin?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await page.getByLabel("School email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Digit 1").waitFor();
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
  const otp = (await admin.auth.admin.generateLink({ type: "magiclink", email })).data.properties?.email_otp as string;
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(otp[i]);
  return { ctx, page };
}
const onusCount = async (page: Page) => Number((await page.locator("[data-onus-count]").getAttribute("data-onus-count")) ?? -1);

await cleanup();
const { rows: [school] } = await db.query(
  `insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains, employee_domains)
   values ($1, 'Test Rating College', 'college', 'Kamloops', 50.30, -119.80, true, $2, '{ratetest.test}') returning id`, [SLUG, [DOMAIN]]);
await db.query("insert into public.institutions (slug, name, type, email_domains) values ('zz-test-rate-other', 'Other Test College', 'college', '{other.ratetest.test}')");
await db.query("select public.refresh_scores($1)", [school.id]);
const browser = await chromium.launch();

try {
  // Signed out: the rating page sends you to sign in and back.
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await page.goto(`${BASE}/rate/${SLUG}`);
    check("signed out: /rate sends you to sign in with ?next back to the form", new URL(page.url()).pathname === "/signin" && page.url().includes(encodeURIComponent(`/rate/${SLUG}`)));
    await ctx.close();
  }

  // Browser A watches the school's panel on the map.
  const watcher = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const A = await watcher.newPage();
  await A.goto(`${BASE}/map/${SLUG}`, { waitUntil: "load" });
  await A.getByRole("complementary").waitFor();
  await A.waitForFunction(() => !!(window as unknown as { __onusMap?: { loaded: () => boolean } }).__onusMap?.loaded(), null, { timeout: 30000 });
  await A.waitForFunction(() => (window as unknown as { __onusRealtime?: string }).__onusRealtime === "SUBSCRIBED", null, { timeout: 20000 });
  check("browser A: panel open with Onus count 0", (await onusCount(A)) === 0);

  // Browser B signs in and lands on the form.
  const email = `r-${run}@${DOMAIN}`;
  const { ctx: raterCtx, page: B } = await signIn(browser, email, `/rate/${SLUG}`);
  check("sign-in returns to the rating form", await onPath(B, `/rate/${SLUG}`));
  check("content note and Get help link on the form", await B.getByText("These questions are about how your school handles reports, not about what happened to you.").isVisible() && await B.getByRole("link", { name: "Get help" }).first().isVisible());
  check("progress reads 1 of 2", await B.getByText("1 of 2", { exact: true }).isVisible());
  check("no free-text fields on the form", (await B.locator("textarea, input[type=text], input:not([type])").count()) === 0);
  check("step 2 is hidden until 'went through' is Yes", !(await B.getByText("Did you feel believed?").isVisible()));
  const submitBtn = B.getByRole("button", { name: "Submit my rating" });
  check("submit is disabled until at least one question is answered", await submitBtn.isDisabled());
  await B.getByRole("radiogroup", { name: "Have you been through your school's reporting process?" }).getByRole("radio", { name: "No", exact: true }).click();
  check("gate 'No' keeps step 2 closed and goes straight to submit", !(await B.getByText("Did you feel believed?").isVisible()) && await submitBtn.isEnabled() && await submitBtn.isVisible());
  await B.getByRole("radiogroup", { name: "Have you been through your school's reporting process?" }).getByRole("radio", { name: "Prefer not to say" }).click();
  check("gate 'Prefer not to say' also goes straight to submit", !(await B.getByText("Did you feel believed?").isVisible()) && await submitBtn.isEnabled());
  await B.getByRole("group", { name: "Have you been through your school's reporting process?" }).getByRole("button", { name: "Clear" }).click();
  check("any question can be cleared (skipped) again", await submitBtn.isDisabled());

  await B.getByRole("radiogroup", { name: "Do you know how to report here?" }).getByRole("radio", { name: "Yes" }).click();
  await B.getByRole("radiogroup", { name: "Would you trust the process?" }).getByRole("radio", { name: /^4/ }).click();
  await B.getByRole("radiogroup", { name: "Have you been through your school's reporting process?" }).getByRole("radio", { name: "Yes" }).click();
  check("Yes opens step 2 (2 of 2)", await B.getByText("Did you feel believed?").isVisible() && await B.getByText("2 of 2", { exact: true }).isVisible());
  await B.getByRole("radiogroup", { name: "Did you feel believed?" }).getByRole("radio", { name: /^3/ }).click();
  await B.getByRole("radiogroup", { name: "Were you kept informed?" }).getByRole("radio", { name: /^2/ }).click();
  await B.getByRole("radio", { name: "1 to 3 months" }).click();
  check("the action question is reworded with the four options",
    (await B.getByRole("radiogroup", { name: "Did the school take any action after your report?" }).getByRole("radio").allInnerTexts()).map((t) => t.trim()).join("|") === "Yes|No|Still in progress|Prefer not to say");
  await B.getByRole("radiogroup", { name: "Did the school take any action after your report?" }).getByRole("radio", { name: "Still in progress" }).click();
  await B.mouse.wheel(0, 3000); await B.waitForTimeout(300);
  const help = B.getByRole("link", { name: "Get help" }).last();
  const box = await help.boundingBox();
  check("Get help stays on screen after scrolling to the bottom", !!box && box.y > 0 && box.y + box.height <= (B.viewportSize()?.height ?? 720));
  await B.getByRole("button", { name: "Submit my rating" }).click();

  await B.getByText("Save this code. It's the only way to change or withdraw your rating, and we can't recover it.").waitFor({ timeout: 15000 });
  const code = ((await B.locator(".font-mono").first().textContent()) ?? "").trim();
  check("done screen shows an 8-character edit code in the mono face", /^[A-HJ-NP-Z2-9]{8}$/.test(code), code.replace(/./g, "•"));
  check("done screen has Copy and Back to the school", await B.getByRole("button", { name: "Copy" }).isVisible() && await B.getByRole("link", { name: "Back to Test Rating College" }).isVisible());

  // The stored rating: right answers, no link to the account.
  const { rows: stored } = await db.query("select * from public.ratings where institution_id = $1", [school.id]);
  const r = stored[0];
  check("rating stored with the answers given", stored.length === 1 && r.knows_how === true && r.trust === 4 && r.went_through === true && r.believed === 3 && r.informed === 2 && r.time_bucket === "1_3m" && r.consequence === "still_waiting");
  check("stored as source onus, role student, not demo", r.source === "onus" && r.role === "student" && r.is_demo === false);
  check("nothing in the rating row identifies the account", !JSON.stringify(r).includes(email) && !Object.keys(r).some((k) => /user|email|profile|created/.test(k)));

  // Browser A: the count ticks up live, and the dot pulses.
  const ticked = await A.waitForFunction(() => document.querySelector("[data-onus-count]")?.getAttribute("data-onus-count") === "1", null, { timeout: 15000 }).then(() => true).catch(() => false);
  check("browser A: Onus count ticks 0 -> 1 live, without a reload", ticked);
  const pulsed = await A.evaluate((slug) => JSON.stringify((window as unknown as { __onusMap: { getFilter: (id: string) => unknown } }).__onusMap.getFilter("school-pulse")).includes(slug), SLUG);
  check("browser A: the school's dot pulses", pulsed);

  // Rating again: the already-rated screen and the code.
  await B.goto(`${BASE}/rate/${SLUG}`);
  check("rating again shows 'already rated' with a code field", await B.getByText("You've already rated Test Rating College. Use your code to change or withdraw it.").isVisible());
  await B.getByLabel("Your code").fill("ZZZZZZZZ");
  await B.getByRole("button", { name: "Withdraw my rating" }).click();
  check("a wrong code is refused", await B.getByText("That code didn't match a rating. Check it and try again.").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
  await B.getByLabel("Your code").fill(code);
  await B.getByRole("button", { name: "Change my answers" }).click();
  await B.getByRole("radiogroup", { name: "Would you trust the process?" }).getByRole("radio", { name: /^2/ }).click();
  await B.getByRole("button", { name: "Save my changes" }).click();
  await B.getByText("Your rating is updated.").waitFor({ timeout: 10000 });
  const { rows: [edited] } = await db.query("select trust, knows_how, went_through from public.ratings where institution_id = $1", [school.id]);
  check("the code changes the answers (the new answers replace the old)", edited.trust === 2 && edited.knows_how === null && edited.went_through === null, JSON.stringify(edited));

  await B.goto(`${BASE}/rate/${SLUG}`);
  await B.getByLabel("Your code").fill(code);
  await B.getByRole("button", { name: "Withdraw my rating" }).click();
  await B.getByText("Your rating is withdrawn. It no longer counts.").waitFor({ timeout: 10000 });
  const back = await A.waitForFunction(() => document.querySelector("[data-onus-count]")?.getAttribute("data-onus-count") === "0", null, { timeout: 15000 }).then(() => true).catch(() => false);
  check("withdrawing ticks browser A's count back to 0 live", back);
  await raterCtx.close();

  // A student from another school can't rate this one.
  const { ctx: otherCtx, page: O } = await signIn(browser, `o-${run}@other.ratetest.test`, `/rate/${SLUG}`);
  await onPath(O, `/rate/${SLUG}`);
  check("another school's student is pointed to their own school", await O.getByText("Your school email is from Other Test College").isVisible());
  await otherCtx.close();
  await watcher.close();
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await cleanup();
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
