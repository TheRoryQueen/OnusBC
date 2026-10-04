// My account checks in a real browser: signed-out redirect; Profile (school, role, masked email, what can change);
// Reviews (ratings kept on this device, backup code, Delete with Are you sure?); Privacy's Sign out and Delete
// account with Are you sure?, which removes the account (email, profile, has_rated) and keeps the anonymous
// rating; and the rules for changing school and role (update_profile).
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
const SLUG = "zz-test-account", DOMAIN = "student.accounttest.test", SHARED = "shared.accounttest.test";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
async function cleanup() {
  const { rows } = await db.query("select id from auth.users where email like '%accounttest.test'");
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.query("delete from public.institutions where slug = any($1)", [[SLUG, "zz-test-shared-a", "zz-test-shared-b"]]);
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
  check("Profile shows school, role and email, and no username", !body.includes(profile.username) && body.includes("Test Account College") && /student/i.test(body), profile.username);
  check("the email is masked", body.includes(`a•••@${DOMAIN}`) && !body.includes(email));
  check("a student domain's role and single school can't be changed", (await page.getByRole("radiogroup", { name: "Role" }).count()) === 0 && (await page.getByRole("combobox", { name: "School" }).count()) === 0 && body.includes("Set by your school email."));
  check("the nav shows Account", await page.locator("header").getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Account" }).isVisible());
  check("sections are Profile, Privacy and Reviews", JSON.stringify((await page.getByRole("tab").allInnerTexts()).map((t) => t.trim())) === JSON.stringify(["Profile", "Privacy", "Reviews"]));

  // Reviews: nothing from this device yet, explained.
  await page.getByRole("tab", { name: "Reviews" }).click();
  check("no ratings on this device: it explains ratings can't be traced to an account", await page.getByText("By design, Onus can't trace a rating back to an account", { exact: false }).isVisible());
  // A rating through the real route, kept on this device the way the form keeps it.
  const saved = await page.evaluate(async (slug) => {
    const r = await fetch("/api/ratings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, answers: { knows_how: true } }) });
    const { code } = await r.json();
    localStorage.setItem("onus.ratings.v1", JSON.stringify([{ slug, school: "Test Account College", code, saved: "2026-10-03" }]));
    return { status: r.status, code };
  }, SLUG);
  check("a rating saved for the Reviews section", saved.status === 200, String(saved.status));
  await page.goto(`${BASE}/account?tab=reviews`, { waitUntil: "load" });
  check("?tab=reviews opens Reviews, listing the rating made on this device", await page.getByText("Rated on this device", { exact: false }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false) && (await page.getByRole("tab", { name: "Reviews" }).getAttribute("aria-selected")) === "true");
  await page.getByRole("button", { name: "Save a backup code" }).click();
  check("Save a backup code shows the code", (await page.locator(".font-mono").first().textContent())?.trim() === saved.code);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dlg = page.getByRole("alertdialog");
  check("deleting a rating asks Are you sure?", await dlg.getByText("Are you sure?").isVisible());
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await dlg.waitFor({ state: "hidden" });
  const { rows: [still] } = await db.query("select withdrawn from public.ratings where institution_id = $1", [school.id]);
  check("Cancel keeps the rating", still.withdrawn === false);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete rating" }).click();
  await page.getByText("No ratings from this device.").waitFor({ timeout: 10000 });
  const { rows: [gone] } = await db.query("select withdrawn from public.ratings where institution_id = $1", [school.id]);
  check("Delete withdraws the rating and removes it from this device", gone.withdrawn === true && (await page.evaluate(() => localStorage.getItem("onus.ratings.v1"))) === "[]");

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

  // Delete account, with an Are you sure? dialog; Sign out sits beside it.
  await page.getByRole("tab", { name: "Privacy" }).click();
  check("Privacy explains what Onus stores", await page.getByText("Onus keeps as little as it can about you.").isVisible());
  const so = await page.getByRole("button", { name: "Sign out" }).boundingBox(), da = await page.getByRole("button", { name: "Delete account" }).boundingBox();
  check("Sign out and Delete account sit side by side", !!so && !!da && Math.abs(so.y - da.y) < 4);
  await page.getByRole("button", { name: "Delete account" }).click();
  check("delete asks Are you sure?", await page.getByRole("alertdialog").getByText("Are you sure?").isVisible());
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  check("Cancel backs out", await page.getByRole("alertdialog").waitFor({ state: "hidden", timeout: 5000 }).then(() => true).catch(() => false));
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.screenshot({ path: "screenshots/account-delete-confirm-1440-light.png" });
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  const { rows: users } = await db.query("select id from auth.users where email = $1", [email]);
  const { rows: [ratings] } = await db.query("select count(*)::int n from public.ratings where institution_id = $1", [school.id]);
  check("the account is gone (email, profile, has_rated) and you're signed out", users.length === 0 && await page.locator("header").getByRole("link", { name: "Sign in" }).isVisible());
  check("the anonymous rating row stays (withdrawn above, never linked)", ratings.n === 1);
  await page.context().close();

  // Sign out (a second person).
  const page2 = await signIn(browser, `ben-${run}@${DOMAIN}`, "/account");
  await page2.getByRole("tab", { name: "Privacy" }).click();
  await page2.getByRole("button", { name: "Sign out" }).click();
  check("Sign out works and the nav shows Sign in", await page2.locator("header").getByRole("link", { name: "Sign in" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
  await page2.context().close();

  // Changing school and role (update_profile): only what the email proves. Two test schools share a domain
  // for students and staff (like UBC's two campuses), so their people can switch between them and choose a
  // role; nobody can move to a school their email doesn't belong to, or change school after rating.
  const { rows: [a] } = await db.query(`insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains, employee_domains) values ('zz-test-shared-a', 'Shared Test A', 'college', 'Kamloops', 50.3, -119.8, true, $1, $1) returning id`, [[SHARED]]);
  const { rows: [b] } = await db.query(`insert into public.institutions (slug, name, type, city, lat, lng, policy_found, email_domains, employee_domains) values ('zz-test-shared-b', 'Shared Test B', 'college', 'Kamloops', 50.3, -119.8, true, $1, $1) returning id`, [[SHARED]]);
  const asUser = async (email: string) => {
    await admin.auth.admin.createUser({ email, email_confirm: true });
    const otp = (await admin.auth.admin.generateLink({ type: "magiclink", email })).data.properties?.email_otp as string;
    const c = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    await c.auth.verifyOtp({ email, token: otp, type: "email" });
    return c;
  };
  const cara = await asUser(`cara-${run}@${SHARED}`);
  await db.query("update public.profiles set institution_id = $1, role = 'student' where id = (select id from auth.users where email = $2)", [a.id, `cara-${run}@${SHARED}`]);
  const r1 = await cara.rpc("update_profile", { p_institution_id: b.id, p_role: "staff" });
  const { rows: [cp] } = await db.query("select institution_id, role from public.profiles where id = (select id from auth.users where email = $1)", [`cara-${run}@${SHARED}`]);
  check("a shared domain can switch between its schools and choose a role", !r1.error && cp.institution_id === b.id && cp.role === "staff", r1.error?.message);
  const r2 = await cara.rpc("update_profile", { p_institution_id: school.id });
  check("nobody can move to a school their email doesn't belong to", !!r2.error && r2.error.message.includes("institution_does_not_match_email"), r2.error?.message);
  await db.query("insert into public.has_rated (user_id, institution_id) select id, $1 from auth.users where email = $2", [b.id, `cara-${run}@${SHARED}`]);
  const r3 = await cara.rpc("update_profile", { p_institution_id: a.id });
  check("the school can't change after rating", !!r3.error && r3.error.message.includes("school_locked_after_rating"), r3.error?.message);
  const dan = await asUser(`dan-${run}@${DOMAIN}`);
  const r4 = await dan.rpc("update_profile", { p_role: "staff" });
  check("a role set by the email domain can't be changed", !!r4.error && r4.error.message.includes("role_set_by_email"), r4.error?.message);
  const anon = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
  check("signed out, update_profile is refused", !!(await anon.rpc("update_profile", { p_role: "staff" })).error);
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await cleanup();
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
