// Step 4: the quote check. Every quote the model gave must appear in the extracted policy text
// (after normalize(): whitespace, curly quotes, dashes, ligatures, line-break hyphens; case kept).
// A quote that is not found is rejected: the criterion scores 0 with the note "Not found in policy."
// The section label is taken from where the quote actually occurs, not from the model.
// Then grades and scores are written to Supabase. The database also refuses unverified quotes.
// Usage: npm run verify -- <slug> [...] | --all
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dbClient } from "../lib/db.mts";
import { EXTRACTED, GRADING, normalize, readManifest, writeJson } from "./common.mts";
import { RUBRIC } from "./rubric.mts";

const MIN_QUOTE = 20;
const args = process.argv.slice(2);
const slugs = args.includes("--all")
  ? readdirSync(GRADING).filter((f) => f.endsWith(".raw.json")).map((f) => f.replace(".raw.json", ""))
  : args;
type Item = { criterion_id: string; score: number; quote: string; section: string; reason: string };
type Final = { criterion_id: string; score: number; quote: string | null; section: string | null; verified: boolean; note: string | null };

const manifest = readManifest();
const db = await dbClient();
const totals = { schools: 0, quotes: 0, accepted: 0, rejected: 0 };
const rejectedExamples: unknown[] = [];

// policy_found in the database follows the crawl (a school with no public policy shows grey).
for (const [slug, m] of Object.entries(manifest)) {
  await db.query("update public.institutions set policy_found = $2 where slug = $1", [slug, m.policy_found]);
}

for (const slug of slugs) {
  const rawPath = `${GRADING}${slug}.raw.json`;
  if (!existsSync(rawPath) || !existsSync(`${EXTRACTED}${slug}.json`)) { console.log(`skip ${slug}: not graded or not extracted`); continue; }
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const doc = JSON.parse(readFileSync(`${EXTRACTED}${slug}.json`, "utf8"));
  if (raw.policy_sha256 !== doc.sha256) { console.log(`skip ${slug}: graded a different version of the policy; re-run grade`); continue; }
  const fullText = normalize(doc.text);
  const sections = doc.sections.map((s: { section: string; text: string }) => ({ section: s.section, text: normalize(s.text) }));
  const items: Item[] = raw.items;
  const finals: Final[] = [];
  let acc = 0, rej = 0;

  for (const c of RUBRIC) {
    const it = items.find((i) => i.criterion_id === c.id);
    if (!it) { finals.push({ criterion_id: c.id, score: 0, quote: null, section: null, verified: false, note: "Not graded." }); continue; }
    const score = Math.max(0, Math.min(2, Math.round(it.score)));
    if (score === 0) { finals.push({ criterion_id: c.id, score: 0, quote: null, section: null, verified: false, note: null }); continue; }
    totals.quotes++;
    const q = normalize(it.quote ?? "");
    let reason = "";
    if (q.length < MIN_QUOTE) reason = "too short to verify";
    else if (/\.\.\.|…/.test(it.quote)) reason = "contains an ellipsis";
    else if (!fullText.includes(q)) reason = "not found verbatim in the policy text";
    if (reason) {
      rej++;
      finals.push({ criterion_id: c.id, score: 0, quote: null, section: null, verified: false, note: "Not found in policy." });
      rejectedExamples.push({ slug, criterion_id: c.id, model_score: score, model_section: it.section, quote: it.quote, reason });
      continue;
    }
    acc++;
    // The quote can wrap across a section boundary only if it is not inside one section; prefer the section that contains it.
    const home = sections.find((s: { text: string }) => s.text.includes(q));
    finals.push({ criterion_id: c.id, score, quote: it.quote.trim(), section: home?.section ?? null, verified: true, note: home ? null : "Quote spans two sections." });
  }
  totals.schools++; totals.accepted += acc; totals.rejected += rej;

  // Write: replace this school's grades in one transaction, then recompute scores.
  const inst = (await db.query("select id from public.institutions where slug = $1", [slug])).rows[0];
  await db.query("begin");
  await db.query("delete from public.grades where institution_id = $1", [inst.id]);
  for (const f of finals) {
    await db.query(
      `insert into public.grades (institution_id, criterion_id, score, quote, section, verified, note, graded_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [inst.id, f.criterion_id, f.score, f.quote, f.section, f.verified, f.note, raw.graded_at]
    );
  }
  await db.query("select public.refresh_scores($1)", [inst.id]);
  await db.query("commit");
  const s = (await db.query("select paper_gpa, paper_letter from public.institution_scores where institution_id = $1", [inst.id])).rows[0];
  writeJson(`${GRADING}${slug}.json`, { slug, model: raw.model, prompt_version: raw.prompt_version, policy_sha256: raw.policy_sha256, source_url: raw.source_url, graded_at: raw.graded_at, paper_gpa: Number(s.paper_gpa), paper_letter: s.paper_letter, accepted: acc, rejected: rej, grades: finals });
  console.log(`${slug.padEnd(15)} ${acc} quotes verified, ${rej} rejected  ->  On paper ${s.paper_gpa} (${s.paper_letter})`);
}

writeJson(`${GRADING}rejected-quotes.json`, rejectedExamples);
const unverified = (await db.query("select count(*)::int n from public.grades where quote is not null and not verified")).rows[0].n;
const total = (await db.query("select count(*)::int n, count(distinct institution_id)::int s from public.grades")).rows[0];
console.log(`\n${totals.schools} schools, ${totals.quotes} quotes checked: ${totals.accepted} verified, ${totals.rejected} rejected`);
console.log(`database: ${total.n} grades across ${total.s} schools; unverified quotes stored: ${unverified}`);
await db.end();
