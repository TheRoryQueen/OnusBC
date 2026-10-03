// My account checks in a real browser: signed-out redirect; Profile (username, school, role, masked email);
// Reviews ("You've rated [School]" with the edit link); Privacy's Delete account with a confirm step, which
// removes the account (email, profile, has_rated) and keeps the anonymous rating; Sign out.
// Uses a temporary zz-test school and .test domains (no email sent); removes everything afterwards.
// Needs the dev server. Usage: npm run test:account
import { randomBytes } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dbClient, requireEnv } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const db = await dbClient();
const run = randomBytes(3).toString("hex");
const SLUG = "zz-test-account", DOMAIN = "student.accounttest.test";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
async function cleanup() {
  const { rows } = await db.query("select id from auth.users where email like '%accounttest.test'");
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.query("delete from public.institutions where slug = $1", [SLUG]);
}
async function signIn(browser: Browser, email: string, next: string, viewport = { width: 1440, height: 900 }, colorScheme: "light" | "dark" = "light") {
  const page = await (await browser.newContext({ viewport, colorScheme })).newPage();
  await page.route("**/auth/v1/otp*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${BASE}/signin?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await page.getByLabel("School email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Digit 1").waitFor();
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
  const otp = (await admin.auth.admin.generateLink({ type: "magiclink", email })).data.properties?.email_otp as string;
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(otp[i]);
  await page.waitForURL((u) => u.pathname === next, { timeout: 20000 });
  return page;
}

await cleanup();
const { rows: [school] } = await db.query(
  `insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains) values ($1, 'Test Account College', 'college', 'Kamloops', 50.3, -119.8, true, $2) returning id`,
  [SLUG, [DOMAIN]]);
const browser = await chromium.launch();
try {
  {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/account`);
    check("signed out: /account sends you to sign in and back", new URL(page.url()).pathname === "/signin" && page.url().includes(encodeURIComponent("/account")));
    await page.context().close();
  }

  const email = `ann-${run}@${DOMAIN}`;
  const page = await signIn(browser, email, "/account");
  const { rows: [profile] } = await db.query("select p.username from public.profiles p join auth.users u on u.id = p.id where u.email = $1", [email]);
  const body = await page.locator("main").innerText();
  check("Profile shows the random username, school and role", body.includes(profile.username) && body.includes("Test Account College") && /student/i.test(body), profile.username);
  check("the email is masked", body.includes(`a•••@${DOMAIN}`) && !body.includes(email));
  check("the nav shows My account", await page.locator("header").getByRole("link", { name: "My account" }).isVisible());

  // A rating, so Reviews has a row (through the real route).
  const res = await page.evaluate(async (slug) => (await fetch("/api/ratings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, answers: { knows_how: true } }) })).status, SLUG);
  check("a rating saved for the Reviews tab", res === 200, String(res));
  await page.reload({ waitUntil: "load" });
  await page.getByRole("tab", { name: "Reviews" }).click();
  check("Reviews lists 'You've rated [School]' with the edit link", await page.getByText("You've rated Test Account College").isVisible() && (await page.getByRole("link", { name: "Change or withdraw with your code" }).getAttribute("href")) === `/rate/${SLUG}`);

  // Screenshots: the four views of this page.
  for (const [w, h] of [[390, 844], [1440, 900]]) for (const scheme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload({ waitUntil: "load" }); // the theme is set by a script at load
    await page.getByRole("tab", { name: "Profile" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/account-${w}-${scheme}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ colorScheme: "light" }); await page.reload({ waitUntil: "load" });

  // Delete account, with a confirm step.
  await page.getByRole("tab", { name: "Privacy" }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  check("delete asks to confirm first", await page.getByText("Delete your account for good?").isVisible());
  await page.getByRole("button", { name: "Keep my account" }).click();
  check("'Keep my account' backs out", await page.getByRole("button", { name: "Delete my account" }).isVisible());
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.screenshot({ path: "screenshots/account-delete-confirm-1440-light.png" });
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  const { rows: users } = await db.query("select id from auth.users where email = $1", [email]);
  const { rows: [ratings] } = await db.query("select count(*)::int n from public.ratings where institution_id = $1", [school.id]);
  check("the account is gone (email, profile, has_rated) and you're signed out", users.length === 0 && await page.locator("header").getByRole("link", { name: "Sign in" }).isVisible());
  check("the anonymous rating stays", ratings.n === 1);
  await page.context().close();

  // Sign out (a second person).
  const page2 = await signIn(browser, `ben-${run}@${DOMAIN}`, "/account");
  await page2.getByRole("button", { name: "Sign out" }).click();
  check("Sign out works and the nav shows Sign in", await page2.locator("header").getByRole("link", { name: "Sign in" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
  await page2.context().close();
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await cleanup();
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
