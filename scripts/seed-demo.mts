// Milestone 8: demo ratings so every school shows an In practice grade (PRD, "Demo seed volume").
// Every rating row is source = 'sample' and is_demo = true, counted separately in each panel's "sample"
// number, and deletable in one query: delete from ratings where source = 'sample'.
//
// The rule, the same for every school (no school is adjusted by hand):
// - 8 to 25 ratings per school, weeks spread over the last 13 weeks, fixed random seed (reproducible).
// - Every answer centres on the neutral middle of the 0 to 4 scale with small variance, and a school's draw
//   is accepted only if its In practice score lands within 0.1 of its target, so chance can't produce an
//   extreme result.
// - Only real public records move the target: where the school's own annual report gives both formal
//   reports received and reports investigated (same year), the share investigated is the chance a sample
//   rater answers Yes to "Did the school take any action after your report?" (0.5 everywhere else).
//   Disclosure counts are shown in the panel but move nothing.
// Public records come from data/public-records.json (each with its report URL) and are loaded first.
//
// Rows are inserted directly (submit_rating only writes source = 'onus' for a signed-in person).
// Schools that already have sample rows are skipped unless reseeded: --reseed all, or --reseed slug1 slug2.
// Usage: npm run seed:demo [-- --dry-run] [-- --reseed all]
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dbClient } from "./lib/db.mts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const reseedAt = args.indexOf("--reseed");
const reseedArgs = reseedAt >= 0 ? args.slice(reseedAt + 1).filter((a) => !a.startsWith("--")) : [];
const RESEED_ALL = reseedArgs.includes("all");
const RESEED = new Set(reseedArgs);
const SEED = "onus-demo-v2"; // change only to deliberately re-draw every school

type Rec = { slug: string; key: string; year: string; value: number; metric: string; source_url: string; quote: string };
const RECORDS: Rec[] = JSON.parse(readFileSync(new URL("../data/public-records.json", import.meta.url), "utf8")).records;

// Small seeded PRNG (mulberry32).
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashSeed = (s: string) => createHash("sha256").update(`${SEED}:${s}`).digest().readUInt32LE(0);

type Row = {
  role: "student" | "staff" | "alumni"; knows_how: boolean | null; trust: number | null; went_through: boolean | null;
  believed: number | null; informed: number | null; time_bucket: string | null; consequence: string | null; week: number;
};

// The same formula as refresh_scores (PRD, In practice).
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const meanDefined = (xs: (number | null)[]) => mean(xs.filter((x): x is number => x !== null));
const TIME: Record<string, number> = { under_1m: 4, "1_3m": 3, "3_6m": 2, "6m_plus_or_waiting": 1 };
function practiceOf(rows: Row[]) {
  if (rows.length < 5) return null;
  const everyone = meanDefined([
    mean(rows.filter((r) => r.knows_how !== null).map((r) => (r.knows_how ? 4 : 0))),
    mean(rows.filter((r) => r.trust !== null).map((r) => r.trust! - 1)),
  ]);
  const proc = rows.filter((r) => r.went_through === true);
  const process = meanDefined([
    mean(proc.filter((r) => r.believed !== null).map((r) => r.believed! - 1)),
    mean(proc.filter((r) => r.informed !== null).map((r) => r.informed! - 1)),
    mean(proc.filter((r) => r.time_bucket !== null).map((r) => TIME[r.time_bucket!])),
    mean(proc.filter((r) => r.consequence === "yes" || r.consequence === "no").map((r) => (r.consequence === "yes" ? 4 : 0))),
  ]);
  return { practice: proc.length >= 5 && process !== null && everyone !== null ? 0.4 * everyone + 0.6 * process : everyone, nProcess: proc.length };
}

// The neutral baseline: every distribution below has a mean of 2 on the 0 to 4 scale.
const pick = <T,>(r: () => number, opts: [T, number][]) => { let x = r(); for (const [v, p] of opts) { if ((x -= p) < 0) return v; } return opts[opts.length - 1][0]; };
const SCALE: [number, number][] = [[1, 0.1], [2, 0.2], [3, 0.4], [4, 0.2], [5, 0.1]]; // 1 to 5, mean 3 (score 2)
const TIMES: [string, number][] = [["under_1m", 0.1], ["1_3m", 0.2], ["3_6m", 0.3], ["6m_plus_or_waiting", 0.4]]; // score mean 2
function person(r: () => number, pYes: number): Row {
  const skip = () => r() < 0.06;
  const went = pick<boolean | null>(r, [[true, 0.5], [false, 0.42], [null, 0.08]]);
  const row: Row = {
    role: pick(r, [["student", 0.78], ["staff", 0.14], ["alumni", 0.08]]),
    knows_how: skip() ? null : r() < 0.5,
    trust: skip() ? null : pick(r, SCALE),
    went_through: went, believed: null, informed: null, time_bucket: null, consequence: null,
    week: Math.floor(r() * 13),
  };
  if (went) {
    row.believed = skip() ? null : pick(r, SCALE);
    row.informed = skip() ? null : pick(r, SCALE);
    row.time_bucket = skip() ? null : pick(r, TIMES);
    // Still in progress and Prefer not to say count as no answer in the score.
    row.consequence = pick<string | null>(r, [["still_waiting", 0.08], ["prefer_not", 0.04], [null, 0.04], ["answer", 0.84]]);
    if (row.consequence === "answer") row.consequence = r() < pYes ? "yes" : "no";
  }
  return row;
}

// The target follows from the expected answers: everyone block 2; process block mean(2, 2, 2, 4 x pYes).
const targetFor = (pYes: number) => 0.4 * 2 + 0.6 * ((6 + 4 * pYes) / 4);

function ratingsFor(slug: string, pYes: number) {
  const r = rng(hashSeed(slug));
  const n = 8 + Math.floor(r() * 18); // 8 to 25
  const target = targetFor(pYes);
  for (let attempt = 0; attempt < 20000; attempt++) {
    const rows = Array.from({ length: n }, () => person(r, pYes));
    const p = practiceOf(rows);
    // At least 5 through the process, so the process block (and the record) counts for every school.
    if (p && p.practice !== null && p.nProcess >= 5 && Math.abs(p.practice - target) <= 0.1) return { rows, practice: p.practice, target };
  }
  throw new Error(`no draw within 0.1 of ${target.toFixed(2)} for ${slug}`);
}

// The only thing a public record changes: the chance of Yes to "took action".
function pYesFor(slug: string) {
  const reports = RECORDS.find((x) => x.slug === slug && x.key === "formal_reports");
  const investigated = RECORDS.find((x) => x.slug === slug && x.key === "investigated" && x.year === reports?.year);
  return reports && investigated && reports.value > 0 ? { p: investigated.value / reports.value, why: `${investigated.value} of ${reports.value} formal reports investigated (${reports.year})` } : { p: 0.5, why: "" };
}

const db = await dbClient();
try {
  const { rows: schools } = await db.query(`
    select i.id, i.slug, i.policy_found,
      (select count(*)::int from public.ratings r where r.institution_id = i.id and r.source = 'sample') as n_sample
    from public.institutions i where i.slug not like 'zz-%' and i.sector = 'public' order by i.slug`);
  const idOf = new Map(schools.map((s) => [s.slug, s.id]));

  // 1. Public records from the file (replaces those schools' rows, so the table always matches the file).
  if (!DRY) {
    const unknown = RECORDS.filter((x) => !idOf.has(x.slug)).map((x) => x.slug);
    if (unknown.length) throw new Error(`unknown school in data/public-records.json: ${unknown.join(", ")}`);
    await db.query("begin");
    await db.query("delete from public.public_records where institution_id = any($1)", [[...new Set(RECORDS.map((x) => idOf.get(x.slug)))]]);
    for (const x of RECORDS) {
      await db.query("insert into public.public_records (institution_id, year, metric, value, note, source_url) values ($1, $2, $3, $4, $5, $6)",
        [idOf.get(x.slug), x.year, x.metric, x.value, x.quote, x.source_url]);
    }
    await db.query("commit");
    console.log(`Loaded ${RECORDS.length} public records for ${new Set(RECORDS.map((x) => x.slug)).size} schools.`);
  }

  // 2. Sample ratings.
  const thisMonday = new Date(); thisMonday.setUTCHours(0, 0, 0, 0); thisMonday.setUTCDate(thisMonday.getUTCDate() - ((thisMonday.getUTCDay() + 6) % 7));
  let inserted = 0;
  for (const s of schools) {
    const reseed = RESEED_ALL || RESEED.has(s.slug);
    if (s.n_sample > 0 && !reseed) { console.log(`skip ${s.slug}: already has ${s.n_sample} sample ratings (use --reseed)`); continue; }
    const { p, why } = pYesFor(s.slug);
    const { rows, practice, target } = ratingsFor(s.slug, p);
    if (DRY) { console.log(`${s.slug.padEnd(16)} ${String(rows.length).padStart(2)} ratings, practice ${practice.toFixed(2)} (target ${target.toFixed(2)})${why ? `  moved by record: ${why}` : ""}`); continue; }
    await db.query("begin");
    if (reseed) await db.query("delete from public.ratings where institution_id = $1 and source = 'sample'", [s.id]);
    for (const row of rows) {
      const week = new Date(thisMonday); week.setUTCDate(week.getUTCDate() - 7 * row.week);
      await db.query(
        `insert into public.ratings (institution_id, role, knows_how, trust, went_through, believed, informed, time_bucket, consequence,
           week, source, is_demo, edit_code_hash, withdrawn)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'sample', true, $11, false)`,
        [s.id, row.role, row.knows_how, row.trust, row.went_through, row.believed, row.informed, row.time_bucket, row.consequence,
         week.toISOString().slice(0, 10), createHash("sha256").update(randomBytes(16)).digest("hex")]
      );
    }
    await db.query("commit");
    inserted += rows.length;
  }

  if (!DRY) {
    // 3. Recompute every school, then print what the database says.
    for (const s of schools) await db.query("select public.refresh_scores($1)", [s.id]);
    const { rows: out } = await db.query(`
      select i.slug, i.policy_found, s.paper_gpa, s.practice_gpa, s.practice_letter, s.gap, s.gap_label, s.n_sample, s.n_onus, s.n_public
      from public.institutions i join public.institution_scores s on s.institution_id = i.id
      where i.slug not like 'zz-%' and i.sector = 'public' order by s.paper_gpa is null, s.gap_label, i.slug`);
    console.log(`\nInserted ${inserted} sample ratings.\n`);
    console.log("school".padEnd(16), "paper".padEnd(6), "practice".padEnd(9), "gap".padEnd(6), "label".padEnd(20), "sample onus public");
    for (const o of out) {
      const label = o.gap_label ?? (o.policy_found ? "grading in progress" : "-");
      console.log(o.slug.padEnd(16), String(o.paper_gpa ?? "-").padEnd(6), `${o.practice_letter ?? "-"} ${o.practice_gpa ?? ""}`.padEnd(9),
        String(o.gap ?? "-").padEnd(6), label.padEnd(20), String(o.n_sample).padEnd(6), String(o.n_onus).padEnd(4), o.n_public);
    }
    const spread = new Map<string, number>();
    for (const o of out) { const k = o.gap_label ?? (o.policy_found ? "grading in progress" : "none"); spread.set(k, (spread.get(k) ?? 0) + 1); }
    console.log("\nGap spread:", [...spread].map(([k, v]) => `${k} ${v}`).join(", "));
  }
} finally {
  await db.end();
}
