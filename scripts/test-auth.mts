// Milestone 6 checks in a real browser against real Supabase Auth: school email code sign-in end to end,
// wrong domain rejected (server-side hook), role and campus choices on shared domains, return to where
// you came from, judge access, and the judge rate limit.
// No real email is sent: the browser's "send code" request is intercepted and the matching code comes
// from the admin API (generateLink), which issues a code without emailing. Verification is real.
// Wrong-domain attempts do reach Supabase: the hook rejects them before any email is sent.
// Uses reserved .test domains and zz-test-* schools; removes everything afterwards.
// Needs the dev server. Usage: npm run test:auth
import { randomBytes } from "node:crypto";
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dbClient, requireEnv } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const db = await dbClient();
const run = randomBytes(3).toString("hex");
const D = { student: "student.authtest.test", staff: "authtest.test", shared: "shared.authtest.test", campus: "campus.authtest.test" };

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};

async function cleanup() {
  const { rows } = await db.query("select id from auth.users where email like '%authtest.test' or email like 'judge-auth-%@notaschool.test'");
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.query("delete from public.institutions where slug like 'zz-test-auth-%'");
}
async function school(slug: string, name: string, email: string[], employee: string[]) {
  const { rows } = await db.query(
    "insert into public.institutions (slug, name, type, email_domains, employee_domains) values ($1, $2, 'college', $3, $4) returning id",
    [slug, name, email, employee]);
  return rows[0].id as string;
}
// A code for this address without sending email (the user must exist).
async function codeFor(email: string) {
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
  const r = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (r.error) throw new Error(r.error.message);
  return r.data.properties.email_otp as string;
}
async function interceptSend(page: Page) {
  let sent = 0;
  await page.route("**/auth/v1/otp*", (route) => { sent++; return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  return () => sent;
}
async function typeCode(page: Page, code: string) {
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(code[i]);
}
async function pasteCode(page: Page, code: string) {
  await page.getByLabel("Digit 1").focus();
  await page.evaluate((code) => {
    const dt = new DataTransfer(); dt.setData("text", code);
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, code);
}
// Wait for an exact pathname (a regex on the full URL can match /signin?next=... too early).
const onPath = (page: Page, path: string) => page.waitForURL((u) => u.pathname === path, { timeout: 15000 }).then(() => true).catch(() => false);
const profileOf = async (email: string) =>
  (await db.query("select p.role, p.is_judge, i.slug from auth.users u join public.profiles p on p.id = u.id left join public.institutions i on i.id = p.institution_id where u.email = $1", [email])).rows[0];

await cleanup();
const A = await school("zz-test-auth-a", "Test Auth College", [D.student], [D.staff]);
await school("zz-test-auth-shared", "Test Shared College", [D.shared], [D.shared]);
await school("zz-test-auth-c1", "Test Campus North", [D.campus], []);
const C2 = await school("zz-test-auth-c2", "Test Campus South", [D.campus], []);
const browser = await chromium.launch();
let current = "setup";
let lastPage: Page | null = null;
const step = (name: string, page?: Page) => { current = name; if (page) lastPage = page; };

try {
  // 1. Student: send code, paste all six digits (the sixth submits), land back where they came from.
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); step("1 student", page);
    const sent = await interceptSend(page);
    const email = `s-${run}@${D.student}`;
    await page.goto(`${BASE}/signin?next=/map/uvic`, { waitUntil: "networkidle" });
    await page.getByLabel("School email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByText(`We sent a 6-digit code to ${email}. It expires in 10 minutes.`).waitFor();
    check("send code moves to the six code boxes with the PRD copy", true);
    check("resend is locked for 30 seconds", await page.getByRole("button", { name: /Resend code in \d+s/ }).isDisabled());
    await pasteCode(page, await codeFor(email));
    const landed = await onPath(page, "/map/uvic");
    check("pasting the code fills all six and signs in", sent() === 1 && landed, page.url());
    check("returns to where they came from (?next=/map/uvic)", landed);
    check("nav shows Sign out once signed in", await page.getByRole("button", { name: "Sign out" }).isVisible());
    const p = await profileOf(email);
    check("profile: school set from the domain, role student", p?.slug === "zz-test-auth-a" && p?.role === "student", JSON.stringify(p));
    await page.getByRole("button", { name: "Sign out" }).click();
    check("sign out works", await page.getByRole("link", { name: "Sign in" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    await ctx.close();
  }

  // 2. Wrong code, typed digit by digit.
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); step("2 wrong code", page);
    await interceptSend(page);
    const email = `w-${run}@${D.student}`;
    await codeFor(email);
    await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
    await page.getByLabel("School email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Digit 1").waitFor();
    await typeCode(page, "000000");
    await page.getByText("That code didn't match. Check your latest email.").waitFor({ timeout: 10000 }).then(() => check("a wrong code shows the PRD error", true)).catch(() => check("a wrong code shows the PRD error", false));
    await page.getByRole("button", { name: "Use a different email" }).click();
    check("Use a different email goes back", await page.getByLabel("School email").isVisible());
    await ctx.close();
  }

  // 3. Wrong domain: real request; the server-side hook rejects it before any email is sent.
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); step("3 wrong domain", page);
    const email = `nobody-${run}@notaschool.test`;
    await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
    await page.getByLabel("School email").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    const shown = await page.getByText("Onus works with BC public college and university emails. Use your school address, like name@my.capilanou.ca.").waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    const created = (await db.query("select count(*)::int n from auth.users where email = $1", [email])).rows[0].n;
    check("wrong domain is rejected by the server with the PRD message", shown && created === 0, `user created: ${created}`);
    await ctx.close();
  }

  // 4. Shared student/staff domain: the role capsule appears and the choice is saved once.
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); step("4 shared role", page);
    await interceptSend(page);
    const email = `m-${run}@${D.shared}`;
    await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
    await page.getByLabel("School email").fill(email);
    check("shared domain shows Student / Staff / Alumni", await page.getByRole("radio", { name: "Staff" }).isVisible());
    await page.getByRole("button", { name: "Send code" }).click();
    check("sending without a role asks for one", await page.getByText("Choose whether you're a student, staff member, or alum.").isVisible());
    await page.getByRole("radio", { name: "Staff" }).click();
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Digit 1").waitFor();
    await typeCode(page, await codeFor(email));
    await onPath(page, "/map");
    const p = await profileOf(email);
    check("chosen role saved on the profile (staff)", p?.role === "staff" && p?.slug === "zz-test-auth-shared", JSON.stringify(p));
    await ctx.close();
  }

  // 5. Domain shared across campuses (like UBC): campus picker, saved once.
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); step("5 campus", page);
    await interceptSend(page);
    const email = `c-${run}@${D.campus}`;
    await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
    await page.getByLabel("School email").fill(email);
    check("multi-campus domain shows a campus picker", await page.getByRole("radio", { name: "Test Campus South" }).isVisible());
    await page.getByRole("radio", { name: "Test Campus South" }).click();
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Digit 1").waitFor();
    await typeCode(page, await codeFor(email));
    await onPath(page, "/map");
    const p = await profileOf(email);
    check("chosen campus saved on the profile", p?.slug === "zz-test-auth-c2", JSON.stringify(p));
    await ctx.close();
  }

  // 6. Judge access: any email plus the event code.
  {
    const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.9.${run.slice(0, 2).charCodeAt(0) % 250}.1` } }); const page = await ctx.newPage(); step("6 judge", page);
    const email = `judge-auth-${run}@notaschool.test`;
    await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Judge access" }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Event code").fill("not-the-code");
    await page.getByRole("button", { name: "Continue as a judge" }).click();
    check("wrong event code is refused", await page.getByText("That event code didn't match.").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    await page.getByLabel("Event code").fill(requireEnv("JUDGE_EVENT_CODE"));
    await page.getByRole("button", { name: "Continue as a judge" }).click();
    const landed = await onPath(page, "/map");
    const p = await profileOf(email);
    check("judge code signs in and the profile is flagged is_judge", landed && p?.is_judge === true, JSON.stringify(p));
    await ctx.close();
  }

  // 7. Judge rate limit: 10 attempts per IP per 10 minutes (a unique test IP, so other tests aren't blocked).
  {
    const ip = `10.250.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await fetch(`${BASE}/api/judge-login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email: `x${i}@notaschool.test`, code: "wrong" }) });
      statuses.push(r.status);
    }
    check("judge login allows 10 attempts, then 429", statuses.slice(0, 10).every((s) => s === 401) && statuses[10] === 429, statuses.join(","));
  }
} catch (e) {
  if (lastPage) await (lastPage as Page).screenshot({ path: "screenshots/test-auth-failure.png" }).catch(() => {});
  check(`test run completed without crashing (during step: ${current})`, false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  await cleanup();
  void A; void C2;
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
