// Milestone 2 tests: schema, RLS, rating functions, scores, auth hook, judge login.
// Runs against the real Supabase project. Uses only reserved .test domains (they can never receive
// mail) and zz-test-* institutions, and removes everything it created when it finishes.
// Needs the dev server running for the judge-login route: npm run dev, then npm run test:db
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbClient, requireEnv } from "./lib/db.mts";

const URL_ = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const JUDGE_CODE = requireEnv("JUDGE_EVENT_CODE");
const SITE = process.env.TEST_SITE_URL ?? "http://localhost:3000";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = () => createClient(URL_, ANON, opts);
const admin = createClient(URL_, SERVICE, opts);
const db = await dbClient();
const run = randomBytes(3).toString("hex");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++;
  else failed++;
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const DOM = {
  student: "student.onustest.test",
  staff: "onustest.test",
  alumni: "alum.onustest.test",
  blocked: "old.onustest.test",
  shared: "shared.onustest.test",
  campus: "campus.onustest.test",
};
const userIds: string[] = [];

async function cleanup() {
  await db.query("delete from public.institutions where slug like 'zz-test-%'");
  await db.query("delete from public.pending_judges where email like '%.test'");
  await db.query("update public.app_settings set value = 'true' where key = 'demo_mode'");
  const { rows } = await db.query(
    "select id from auth.users where email like '%onustest.test' or email like '%@notaschool.test'"
  );
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  for (const id of userIds) await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function institution(slug: string, fields: Record<string, unknown>) {
  const { rows } = await db.query(
    `insert into public.institutions (slug, name, type, policy_found, email_domains, employee_domains, alumni_domains, blocked_domains)
     values ($1, $2, 'college', $3, $4, $5, $6, $7) returning id`,
    [slug, `Test ${slug}`, fields.policy_found ?? true, fields.email_domains ?? [], fields.employee_domains ?? [],
     fields.alumni_domains ?? [], fields.blocked_domains ?? []]
  );
  return rows[0].id as string;
}

// Signs a user in without sending email: admin generates a magic-link token, the user client verifies it.
async function signIn(email: string): Promise<{ client: SupabaseClient; id: string }> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`generateLink ${email}: ${link.error.message}`);
  const client = anon();
  const v = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (v.error || !v.data.user) throw new Error(`verifyOtp ${email}: ${v.error?.message}`);
  return { client, id: v.data.user.id };
}

async function createUser(email: string) {
  const r = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (r.data.user) userIds.push(r.data.user.id);
  return r;
}

async function scores(id: string) {
  const { rows } = await db.query("select * from public.institution_scores where institution_id = $1", [id]);
  return rows[0];
}

// ---------------------------------------------------------------------------
await cleanup();
const A = await institution("zz-test-a", {
  email_domains: [DOM.student], employee_domains: [DOM.staff], alumni_domains: [DOM.alumni], blocked_domains: [DOM.blocked],
});
const B = await institution("zz-test-b", { email_domains: [DOM.shared], employee_domains: [DOM.shared] });
await institution("zz-test-d1", { email_domains: [DOM.campus] });
const D2 = await institution("zz-test-d2", { email_domains: [DOM.campus] });
const C = await institution("zz-test-c", {});

try {
  // -------------------------------------------------------------------------
  console.log("\n== Signed-out access ==");
  {
    const { data, error } = await anon().from("ratings").select("*");
    check("signed-out user reads zero rows from ratings", (data?.length ?? 0) === 0, error ? `blocked: ${error.message}` : `rows=${data?.length}`);
    const ins = await anon().from("ratings").insert({ institution_id: A, week: "2026-09-28", source: "onus", edit_code_hash: "0".repeat(64) });
    check("signed-out user cannot insert into ratings", !!ins.error, ins.error?.message);
    const hr = await anon().from("has_rated").select("*");
    check("signed-out user reads zero rows from has_rated", (hr.data?.length ?? 0) === 0, hr.error?.message ?? `rows=${hr.data?.length}`);
    const pc = await anon().from("policy_chunks").select("*");
    check("signed-out user reads zero rows from policy_chunks", (pc.data?.length ?? 0) === 0, pc.error?.message ?? `rows=${pc.data?.length}`);
    const s = await anon().rpc("submit_rating", { p_institution_id: A, p_answers: { trust: 3 } });
    check("signed-out submit_rating is refused", !!s.error, s.error?.message);
    const rs = await anon().rpc("refresh_scores", { p_institution_id: A });
    check("signed-out user cannot call refresh_scores", !!rs.error, rs.error?.message);
    const inst = await anon().from("institutions").select("slug").eq("id", A);
    check("institutions are publicly readable", inst.data?.length === 1, inst.error?.message);
  }

  // -------------------------------------------------------------------------
  console.log("\n== Auth hook (function logic) ==");
  {
    const hook = async (email: string) =>
      (await db.query("select public.hook_before_user_created($1::jsonb) r", [JSON.stringify({ user: { email } })])).rows[0].r;
    check("rejects a non-school email (gmail.com)", !!(await hook("someone@gmail.com")).error);
    check("accepts a student domain", JSON.stringify(await hook(`x@${DOM.student}`)) === "{}");
    check("accepts an employee domain", JSON.stringify(await hook(`x@${DOM.staff}`)) === "{}");
    check("accepts an alumni domain", JSON.stringify(await hook(`x@${DOM.alumni}`)) === "{}");
    check("matches the domain case-insensitively", JSON.stringify(await hook(`X@${DOM.student.toUpperCase()}`)) === "{}");
    check("rejects a blocked (forwarding) domain", !!(await hook(`x@${DOM.blocked}`)).error);
    check("rejects a lookalike subdomain (no wildcards)", !!(await hook(`x@evil.${DOM.student}`)).error);
    check("rejects a parent of a school domain", !!(await hook("x@test")).error);
    const r = await hook("someone@gmail.com");
    check("rejection message is the PRD wrong-domain copy",
      r.error?.message === "Onus works with BC public college and university emails. Use your school address, like name@my.capilanou.ca.");
    const priv = await db.query(
      "select has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute') a, has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute') b"
    );
    check("only supabase_auth_admin can run the hook", priv.rows[0].a === true && priv.rows[0].b === false);
  }

  // -------------------------------------------------------------------------
  console.log("\n== Auth hook (live, through Supabase Auth) ==");
  let adminPathHooked = false;
  {
    const bad = `nobody-${run}@notaschool.test`;
    const otp = await anon().auth.signInWithOtp({ email: bad, options: { shouldCreateUser: true } });
    const { rows } = await db.query("select count(*)::int n from auth.users where email = $1", [bad]);
    check("sign-in code request for a non-school email is rejected", !!otp.error && rows[0].n === 0, otp.error?.message);
    check("live rejection carries the PRD copy", (otp.error?.message ?? "").includes("Use your school address"));

    const adminBad = await createUser(`admin-path-${run}@notaschool.test`);
    adminPathHooked = !!adminBad.error;
    console.log(`INFO  admin-created users ${adminPathHooked ? "ARE" : "are NOT"} checked by the hook (${adminBad.error?.message ?? "created"})`);

    const good = await createUser(`s1-${run}@${DOM.student}`);
    check("a school email is accepted and the user is created", !!good.data.user, good.error?.message);
  }

  // -------------------------------------------------------------------------
  console.log("\n== Profiles (trigger and one-time choices) ==");
  const s1 = await signIn(`s1-${run}@${DOM.student}`);
  {
    const { data } = await s1.client.from("profiles").select("*").single();
    check("student-domain profile: school set, role student", data?.institution_id === A && data?.role === "student", JSON.stringify({ role: data?.role }));
    check("username is adjective-animal-number", /^[a-z]+-[a-z]+-\d{2}$/.test(data?.username ?? ""), data?.username);
    check("profile is not a judge", data?.is_judge === false);
    const upd = await s1.client.from("profiles").update({ institution_id: B }).eq("id", s1.id).select();
    check("user cannot change their own school directly", !!upd.error || (upd.data?.length ?? 0) === 0, upd.error?.message ?? "0 rows updated");
  }
  await createUser(`staff-${run}@${DOM.staff}`);
  const staff = await signIn(`staff-${run}@${DOM.staff}`);
  {
    const { data } = await staff.client.from("profiles").select("role, institution_id").single();
    check("employee-domain profile: role staff", data?.role === "staff" && data?.institution_id === A);
    const other = await staff.client.from("profiles").select("*").eq("id", s1.id);
    check("a user cannot read someone else's profile", (other.data?.length ?? 0) === 0);
  }
  await createUser(`alum-${run}@${DOM.alumni}`);
  const alum = await signIn(`alum-${run}@${DOM.alumni}`);
  {
    const { data } = await alum.client.from("profiles").select("role").single();
    check("alumni-domain profile: role alumni", data?.role === "alumni");
  }
  await createUser(`m-${run}@${DOM.shared}`);
  const shared = await signIn(`m-${run}@${DOM.shared}`);
  {
    const { data } = await shared.client.from("profiles").select("role, institution_id").single();
    check("shared-domain profile: school set, role left for the user", data?.institution_id === B && data?.role === null);
    const early = await shared.client.rpc("submit_rating", { p_institution_id: B, p_answers: { trust: 3 } });
    check("cannot rate before choosing a role", !!early.error && early.error.message.includes("profile_incomplete"), early.error?.message);
    const pick = await shared.client.rpc("choose_profile", { p_role: "staff" });
    check("choose_profile sets the role", !pick.error, pick.error?.message);
    const again = await shared.client.rpc("choose_profile", { p_role: "student" });
    check("role can only be chosen once", !!again.error && again.error.message.includes("role_already_set"), again.error?.message);
  }
  await createUser(`c-${run}@${DOM.campus}`);
  const campus = await signIn(`c-${run}@${DOM.campus}`);
  {
    const { data } = await campus.client.from("profiles").select("role, institution_id").single();
    check("multi-campus domain: role student, campus left for the user", data?.role === "student" && data?.institution_id === null);
    const wrong = await campus.client.rpc("choose_profile", { p_institution_id: A });
    check("cannot pick a school that doesn't match the email", !!wrong.error && wrong.error.message.includes("institution_does_not_match_email"), wrong.error?.message);
    const ok = await campus.client.rpc("choose_profile", { p_institution_id: D2 });
    check("can pick a matching campus", !ok.error, ok.error?.message);
  }

  // -------------------------------------------------------------------------
  console.log("\n== Direct writes are blocked ==");
  {
    const ins = await s1.client.from("ratings").insert({ institution_id: A, week: "2026-09-28", source: "onus", edit_code_hash: "0".repeat(64) });
    check("signed-in user cannot insert into ratings", !!ins.error, ins.error?.message);
    const sel = await s1.client.from("ratings").select("*");
    check("signed-in user reads zero rows from ratings", (sel.data?.length ?? 0) === 0, sel.error?.message ?? `rows=${sel.data?.length}`);
    const hr = await s1.client.from("has_rated").insert({ user_id: s1.id, institution_id: B });
    check("signed-in user cannot write has_rated directly", !!hr.error, hr.error?.message);
    const sc = await s1.client.from("institution_scores").update({ n_onus: 999 }).eq("institution_id", A).select();
    check("signed-in user cannot write institution_scores", !!sc.error || (sc.data?.length ?? 0) === 0, sc.error?.message ?? "0 rows updated");
  }

  // -------------------------------------------------------------------------
  console.log("\n== submit_rating ==");
  let code = "";
  {
    const bad1 = await s1.client.rpc("submit_rating", { p_institution_id: A, p_answers: { trust: 3, comment: "free text" } });
    check("rejects an unknown field (no free text)", !!bad1.error && bad1.error.message.includes("unknown field"), bad1.error?.message);
    const bad2 = await s1.client.rpc("submit_rating", { p_institution_id: A, p_answers: { trust: "5" } });
    check("rejects a string where 1 to 5 is expected", !!bad2.error, bad2.error?.message);
    const bad3 = await s1.client.rpc("submit_rating", { p_institution_id: A, p_answers: { went_through: "no", believed: 4 } });
    check("rejects step 2 answers without went_through = yes", !!bad3.error, bad3.error?.message);
    const wrong = await s1.client.rpc("submit_rating", { p_institution_id: B, p_answers: { trust: 3 } });
    check("non-judge cannot rate another school", !!wrong.error && wrong.error.message.includes("wrong_institution"), wrong.error?.message);
    const { rows: none } = await db.query("select count(*)::int n from public.ratings where institution_id in ($1, $2)", [A, B]);
    check("rejected submissions stored nothing", none[0].n === 0);

    const first = await s1.client.rpc("submit_rating", {
      p_institution_id: A,
      p_answers: { knows_how: true, trust: 4, went_through: "yes", believed: 2, informed: 3, time_bucket: "3_6m", consequence: "no" },
    });
    code = (first.data as string) ?? "";
    check("submit_rating works once and returns an 8-character code", !first.error && /^[A-HJ-NP-Z2-9]{8}$/.test(code), first.error?.message ?? `code length ${code.length}`);
    const second = await s1.client.rpc("submit_rating", { p_institution_id: A, p_answers: { trust: 1 } });
    check("a second rating for the same school is rejected", !!second.error && second.error.message.includes("already_rated"), second.error?.message);
    const { rows } = await db.query("select count(*)::int n from public.ratings where institution_id = $1", [A]);
    check("exactly one rating stored", rows[0].n === 1, `n=${rows[0].n}`);
    const hr = await s1.client.from("has_rated").select("institution_id");
    check("has_rated shows the school to its owner", hr.data?.length === 1 && hr.data[0].institution_id === A);
    const hrOther = await staff.client.from("has_rated").select("*");
    check("another user doesn't see it in has_rated", (hrOther.data?.length ?? 0) === 0);
  }

  // -------------------------------------------------------------------------
  console.log("\n== Privacy of the stored rating ==");
  {
    const { rows } = await db.query("select * from public.ratings where institution_id = $1", [A]);
    const row = rows[0];
    check("edit code is stored only as its SHA-256 hash", row.edit_code_hash === sha256(code));
    const whole = JSON.stringify(rows);
    check("plain code appears nowhere in the ratings table", !whole.includes(code));
    const cols = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='ratings'")).rows.map((r) => r.column_name);
    check("ratings has no user id column", !cols.some((c: string) => /user|profile|email|created_at|updated_at/.test(c)), cols.join(","));
    check("ratings has no free-text column besides fixed choices", !cols.includes("comment") && !cols.includes("note"));
    const wk = new Date(row.week);
    check("week is a Monday (rounded to the week)", wk.getUTCDay() === 1, row.week.toISOString?.() ?? String(row.week));
    check("rater role recorded from the account", row.role === "student");
    check("rating stored as source onus, not demo", row.source === "onus" && row.is_demo === false);
    const all = await db.query(
      "select string_agg(t::text, ' ') s from (select * from public.has_rated) t"
    );
    check("plain code appears nowhere in has_rated", !(all.rows[0].s ?? "").includes(code));
  }

  // -------------------------------------------------------------------------
  console.log("\n== edit_rating and withdraw ==");
  {
    const wrong = await anon().rpc("edit_rating", { p_edit_code: "ZZZZZZZZ", p_answers: { trust: 1 } });
    check("a wrong code is rejected", !!wrong.error && wrong.error.message.includes("code_not_found"), wrong.error?.message);
    const free = await anon().rpc("edit_rating", { p_edit_code: code, p_answers: { trust: 1, note: "x" } });
    check("edit rejects unknown fields too", !!free.error, free.error?.message);
    const edit = await anon().rpc("edit_rating", { p_edit_code: code.toLowerCase(), p_answers: { knows_how: false, trust: 2, went_through: "no" } });
    check("edit_rating works with the code alone (any case)", !edit.error && edit.data === true, edit.error?.message);
    const { rows } = await db.query("select * from public.ratings where institution_id = $1", [A]);
    check("edit replaced the answers and cleared step 2",
      rows[0].trust === 2 && rows[0].knows_how === false && rows[0].went_through === false && rows[0].believed === null && rows[0].consequence === null);
    const wd = await anon().rpc("edit_rating", { p_edit_code: code, p_withdraw: true });
    check("withdraw works", !wd.error && wd.data === true, wd.error?.message);
    const { rows: w } = await db.query("select withdrawn from public.ratings where institution_id = $1", [A]);
    check("rating marked withdrawn", w[0].withdrawn === true);
    const after = await anon().rpc("edit_rating", { p_edit_code: code, p_answers: { trust: 5 } });
    check("a withdrawn rating can't be edited again", !!after.error, after.error?.message);
    const sA = await scores(A);
    check("withdrawn rating no longer counted (n_onus = 0)", sA?.n_onus === 0, `n_onus=${sA?.n_onus}`);
  }

  // -------------------------------------------------------------------------
  console.log("\n== refresh_scores ==");
  {
    // Paper: 17 criteria. Give C points on some, with verified quotes.
    const crit = (await db.query("select id, category from public.criteria order by sort")).rows as { id: string; category: string }[];
    const paperScores: Record<string, number> = {};
    crit.forEach((c, i) => (paperScores[c.id] = [2, 1, 0][i % 3]));
    for (const c of crit) {
      const s = paperScores[c.id];
      await db.query(
        "insert into public.grades (institution_id, criterion_id, score, quote, section, verified) values ($1, $2, $3, $4, $5, $6)",
        [C, c.id, s, s > 0 ? "test clause" : null, s > 0 ? "1.1" : null, s > 0]
      );
    }
    let blocked = false;
    try {
      await db.query("insert into public.grades (institution_id, criterion_id, score, quote, verified) values ($1, 'AC-1', 0, 'x', false) on conflict (institution_id, criterion_id) do update set quote = excluded.quote, verified = excluded.verified", [C]);
    } catch { blocked = true; }
    check("database refuses an unverified quote", blocked);

    // Ratings fixture: sample rows (demo), onus rows (real), one withdrawn, two public records.
    type R = { source: "onus" | "sample"; is_demo: boolean; withdrawn?: boolean; knows_how: boolean | null; trust: number | null; went: boolean | null;
      believed?: number; informed?: number; time?: string; cons?: string };
    const fixture: R[] = [
      { source: "sample", is_demo: true, knows_how: true, trust: 5, went: true, believed: 4, informed: 3, time: "under_1m", cons: "yes" },
      { source: "sample", is_demo: true, knows_how: true, trust: 4, went: true, believed: 2, informed: 2, time: "1_3m", cons: "no" },
      { source: "sample", is_demo: true, knows_how: false, trust: 2, went: true, believed: 1, informed: 1, time: "6m_plus_or_waiting", cons: "still_waiting" },
      { source: "sample", is_demo: true, knows_how: true, trust: 3, went: true, believed: 3, informed: 5, time: "3_6m", cons: "prefer_not" },
      { source: "sample", is_demo: true, knows_how: null, trust: 1, went: false },
      { source: "sample", is_demo: true, knows_how: true, trust: 4, went: null },
      { source: "onus", is_demo: false, knows_how: true, trust: 3, went: true, believed: 5, informed: 4, time: "1_3m", cons: "yes" },
      { source: "onus", is_demo: false, knows_how: false, trust: null, went: false },
      { source: "onus", is_demo: false, withdrawn: true, knows_how: true, trust: 5, went: true, believed: 5, informed: 5, time: "under_1m", cons: "yes" },
    ];
    for (const r of fixture) {
      await db.query(
        `insert into public.ratings (institution_id, role, knows_how, trust, went_through, believed, informed, time_bucket, consequence, week, source, is_demo, edit_code_hash, withdrawn)
         values ($1, 'student', $2, $3, $4, $5, $6, $7, $8, '2026-09-28', $9, $10, $11, $12)`,
        [C, r.knows_how, r.trust, r.went, r.believed ?? null, r.informed ?? null, r.time ?? null, r.cons ?? null, r.source, r.is_demo,
         sha256(randomBytes(8).toString("hex")), r.withdrawn ?? false]
      );
    }
    await db.query("insert into public.public_records (institution_id, year, metric, value, source_url) values ($1, '2023/24', 'test', 1, 'https://example.test/a'), ($1, '2024/25', 'test', 2, 'https://example.test/b')", [C]);

    // Independent re-implementation of the PRD formulas.
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const meanDefined = (xs: (number | null)[]) => mean(xs.filter((x): x is number => x !== null));
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const letter = (x: number) => { const v = Math.round(x * 10) / 10; return v >= 3.5 ? "A" : v >= 2.5 ? "B" : v >= 1.5 ? "C" : v >= 0.5 ? "D" : "F"; };
    const cats = [...new Set(crit.map((c) => c.category))];
    const paper = mean(cats.map((cat) => { const cs = crit.filter((c) => c.category === cat); return (cs.reduce((a, c) => a + paperScores[c.id], 0) / (2 * cs.length)) * 4; }))!;
    function expected(rows: R[]) {
      const inc = rows.filter((r) => !r.withdrawn);
      const everyone = meanDefined([
        mean(inc.filter((r) => r.knows_how !== null).map((r) => (r.knows_how ? 4 : 0))),
        mean(inc.filter((r) => r.trust !== null).map((r) => r.trust! - 1)),
      ]);
      const proc = inc.filter((r) => r.went === true);
      const timeScore: Record<string, number> = { under_1m: 4, "1_3m": 3, "3_6m": 2, "6m_plus_or_waiting": 1 };
      const process = meanDefined([
        mean(proc.filter((r) => r.believed).map((r) => r.believed! - 1)),
        mean(proc.filter((r) => r.informed).map((r) => r.informed! - 1)),
        mean(proc.filter((r) => r.time).map((r) => timeScore[r.time!])),
        mean(proc.filter((r) => r.cons === "yes" || r.cons === "no").map((r) => (r.cons === "yes" ? 4 : 0))),
      ]);
      const practice = inc.length < 5 ? null : proc.length >= 5 ? 0.4 * everyone! + 0.6 * process! : everyone;
      return { n_onus: inc.filter((r) => r.source === "onus").length, n_sample: inc.filter((r) => r.source === "sample").length, n_process: proc.length, practice };
    }

    await admin.rpc("refresh_scores", { p_institution_id: C });
    let s = await scores(C);
    let e = expected(fixture);
    check("demo mode on: n_sample counts sample rows", s.n_sample === e.n_sample, `got ${s.n_sample}, expected ${e.n_sample}`);
    check("demo mode on: n_onus counts real app ratings, withdrawn excluded", s.n_onus === e.n_onus, `got ${s.n_onus}, expected ${e.n_onus}`);
    check("n_public counts public_records rows", s.n_public === 2, `got ${s.n_public}`);
    check("n_process counts went-through ratings", s.n_process === e.n_process, `got ${s.n_process}, expected ${e.n_process}`);
    check("paper grade matches the PRD formula", Number(s.paper_gpa) === r2(paper) && s.paper_letter === letter(paper), `got ${s.paper_gpa} ${s.paper_letter}, expected ${r2(paper)} ${letter(paper)}`);
    check("practice grade matches the PRD formula", Number(s.practice_gpa) === r2(e.practice!) && s.practice_letter === letter(e.practice!), `got ${s.practice_gpa} ${s.practice_letter}, expected ${r2(e.practice!)} ${letter(e.practice!)}`);
    check("fewer than 5 process responses: Everyone block only, flagged", s.practice_everyone_only === (e.n_process < 5));
    const gap = r2(paper) - r2(e.practice!);
    const label = Math.abs(gap) <= 0.5 ? "aligned" : gap < -0.5 ? "better_in_practice" : gap <= 1.5 ? "some_gap" : "big_gap";
    check("gap and label follow the PRD table", Number(s.gap) === r2(gap) && s.gap_label === label, `got ${s.gap} ${s.gap_label}, expected ${r2(gap)} ${label}`);

    // Add one more went-through sample so the process block has 5 responses and the 40/60 blend applies.
    const extra: R = { source: "sample", is_demo: true, knows_how: true, trust: 2, went: true, believed: 2, informed: 3, time: "3_6m", cons: "no" };
    await db.query(
      `insert into public.ratings (institution_id, role, knows_how, trust, went_through, believed, informed, time_bucket, consequence, week, source, is_demo)
       values ($1, 'staff', true, 2, true, 2, 3, '3_6m', 'no', '2026-09-21', 'sample', true)`, [C]);
    await admin.rpc("refresh_scores", { p_institution_id: C });
    s = await scores(C);
    e = expected([...fixture, extra]);
    check("5+ process responses: 40% Everyone + 60% process", Number(s.practice_gpa) === r2(e.practice!) && s.practice_everyone_only === false, `got ${s.practice_gpa}, expected ${r2(e.practice!)}`);

    await db.query("update public.app_settings set value = 'false' where key = 'demo_mode'");
    await admin.rpc("refresh_scores", { p_institution_id: C });
    s = await scores(C);
    check("demo mode off: sample rows excluded (n_sample = 0)", s.n_sample === 0 && s.n_onus === 2, `n_sample=${s.n_sample} n_onus=${s.n_onus}`);
    check("fewer than 5 ratings: practice hidden, 'not enough ratings'", s.practice_gpa === null && s.gap_label === "not_enough_ratings", `${s.practice_gpa} ${s.gap_label}`);
    await db.query("update public.app_settings set value = 'true' where key = 'demo_mode'");

    await db.query("update public.institutions set policy_found = false where id = $1", [C]);
    await admin.rpc("refresh_scores", { p_institution_id: C });
    s = await scores(C);
    check("no public policy: grey label, no gap", s.gap_label === "no_policy" && s.gap === null);
  }

  // -------------------------------------------------------------------------
  console.log("\n== Judge login (POST /api/judge-login on the dev server) ==");
  {
    const post = (body: unknown) => fetch(`${SITE}/api/judge-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const judgeEmail = `judge-${run}@notaschool.test`;
    const bad = await post({ email: judgeEmail, code: "wrong-code" });
    check("wrong event code is rejected (401)", bad.status === 401);
    const { rows: none } = await db.query("select count(*)::int n from auth.users where email = $1", [judgeEmail]);
    check("wrong event code creates no user", none[0].n === 0);
    const hijack = await post({ email: `s1-${run}@${DOM.student}`, code: JUDGE_CODE });
    check("event code can't be used to sign in as an existing student (403)", hijack.status === 403);
    const ok = await post({ email: judgeEmail, code: JUDGE_CODE });
    const okBody = (await ok.json()) as { token_hash?: string; error?: string };
    check("right event code with a non-school email returns a one-time token", ok.status === 200 && !!okBody.token_hash, okBody.error ?? `status ${ok.status}`);
    const judge = anon();
    const v = await judge.auth.verifyOtp({ type: "magiclink", token_hash: okBody.token_hash ?? "" });
    if (v.data.user) userIds.push(v.data.user.id);
    check("the token signs the judge in", !!v.data.session, v.error?.message);
    const reuse = await anon().auth.verifyOtp({ type: "magiclink", token_hash: okBody.token_hash ?? "" });
    check("the token works only once", !!reuse.error, reuse.error?.message);
    const { data: prof } = await judge.from("profiles").select("is_judge, institution_id, role").single();
    check("judge profile is flagged is_judge", prof?.is_judge === true && prof?.institution_id === null);
    const { rows: pj } = await db.query("select count(*)::int n from public.pending_judges where email = $1", [judgeEmail]);
    check("judge clearance is removed after use", pj[0].n === 0);

    const before = (await scores(B))?.n_onus ?? 0;
    const jr = await judge.rpc("submit_rating", { p_institution_id: B, p_answers: { knows_how: true, trust: 5, went_through: "prefer_not" } });
    check("judge can rate any school", !jr.error && typeof jr.data === "string", jr.error?.message);
    const { rows: jrows } = await db.query("select source, is_demo, role from public.ratings where institution_id = $1", [B]);
    check("judge rating is flagged is_demo, source onus, no role", jrows.length === 1 && jrows[0].is_demo === true && jrows[0].source === "onus" && jrows[0].role === null, JSON.stringify(jrows));
    const after = (await scores(B))?.n_onus;
    check("judge rating ticks the school's Onus count live (demo mode)", after === before + 1, `${before} -> ${after}`);
    const jr2 = await judge.rpc("submit_rating", { p_institution_id: B, p_answers: { trust: 1 } });
    check("judge also can't rate the same school twice", !!jr2.error && jr2.error.message.includes("already_rated"), jr2.error?.message);

    if (!adminPathHooked) {
      console.log("INFO  admin path not hooked: the judge route's clearance step was not needed for creation, but profile flagging still relies on it.");
    }
  }

  // -------------------------------------------------------------------------
  console.log("\n== Account deletion ==");
  {
    const { rows: hr } = await db.query("select count(*)::int n from public.has_rated where user_id = $1", [s1.id]);
    await admin.auth.admin.deleteUser(s1.id);
    const { rows: p } = await db.query("select count(*)::int n from public.profiles where id = $1", [s1.id]);
    const { rows: hr2 } = await db.query("select count(*)::int n from public.has_rated where user_id = $1", [s1.id]);
    const { rows: r } = await db.query("select count(*)::int n from public.ratings where institution_id = $1", [A]);
    check("deleting the account removes profile and has_rated, rating remains", hr[0].n === 1 && p[0].n === 0 && hr2[0].n === 0 && r[0].n === 1);
  }
} catch (e) {
  check("test run completed without crashing", false, errText(e));
} finally {
  await cleanup();
  const { rows } = await db.query("select (select count(*) from public.institutions where slug like 'zz-test-%')::int i, (select count(*) from auth.users where email like '%.test')::int u");
  console.log(`\ncleanup: ${rows[0].i} test institutions and ${rows[0].u} test users left`);
  await db.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
