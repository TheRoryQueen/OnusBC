// Step 4: the quote check. Every quote the model gave must appear in the extracted policy text
// (after normalize(): whitespace, curly quotes, dashes, ligatures, line-break hyphens; case kept).
// A quote that is not found is rejected: the criterion scores 0 with the note "Not found in policy."
// The section label is taken from where the quote actually occurs, not from the model.
// Then grades and scores are written to Supabase. The database also refuses unverified quotes.
// Usage: npm run verify -- <slug> [...] | --all
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dbClient } from "../lib/db.mts";
import { EXTRACTED, GRADING, readManifest, writeJson } from "./common.mts";
import { checkItem, quoteIndex, type Final, type Item } from "../../lib/grading/grader.ts";
import { RUBRIC } from "./rubric.mts";

const args = process.argv.slice(2);
const slugs = args.includes("--all")
  ? readdirSync(GRADING).filter((f) => f.endsWith(".raw.json")).map((f) => f.replace(".raw.json", ""))
  : args;

const manifest = readManifest();
const db = await dbClient();
const totals = { schools: 0, quotes: 0, accepted: 0, rejected: 0 };
const rejectedExamples: unknown[] = [];

// policy_found in the database follows the crawl (a school with no public policy shows grey).
for (const [slug, m] of Object.entries(manifest)) {
  await db.query("update public.institutions set policy_found = $2 where slug = $1", [slug, m.policy_found]);
}

for (const [slug, m] of Object.entries(manifest)) {
  if (!m.note) continue;
  const inst = (await db.query("select id from public.institutions where slug = $1", [slug])).rows[0];
  await db.query("delete from public.grades where institution_id = $1", [inst.id]);
  await db.query("insert into public.grades (institution_id, criterion_id, score, verified, note) values ($1, 'AC-2', 0, false, $2)", [inst.id, m.note]);
  await db.query("select public.refresh_scores($1)", [inst.id]);
  console.log(`${slug.padEnd(15)} ${m.note}: Publicly posted and easy to find scored 0`);
}

for (const slug of slugs) {
  const rawPath = `${GRADING}${slug}.raw.json`;
  if (!existsSync(rawPath) || !existsSync(`${EXTRACTED}${slug}.json`)) { console.log(`skip ${slug}: not graded or not extracted`); continue; }
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const doc = JSON.parse(readFileSync(`${EXTRACTED}${slug}.json`, "utf8"));
  if (raw.policy_sha256 !== doc.sha256) { console.log(`skip ${slug}: graded a different version of the policy; re-run grade`); continue; }
  const index = quoteIndex(doc.sections);
  const items: Item[] = raw.items;
  const finals: Final[] = [];
  let acc = 0, rej = 0;

  for (const c of RUBRIC) {
    const { model_score, model_quote, reject_reason, ...f } = checkItem(c.id, items.find((i) => i.criterion_id === c.id), index);
    finals.push(f);
    if (f.score === 0 && !reject_reason) continue;
    totals.quotes++;
    if (reject_reason) {
      rej++;
      rejectedExamples.push({ slug, criterion_id: c.id, model_score, model_section: items.find((i) => i.criterion_id === c.id)?.section, quote: model_quote, reason: reject_reason });
    } else acc++;
  }
  totals.schools++; totals.accepted += acc; totals.rejected += rej;

  // Write: replace this school's grades in one transaction, then recompute scores.
  const inst = (await db.query("select id from public.institutions where slug = $1", [slug])).rows[0];
  await db.query("begin");
  await db.query("delete from public.grades where institution_id = $1", [inst.id]);
  for (const f of finals) {
    await db.query(
      `insert into public.grades (institution_id, criterion_id, score, quote, document, section, verified, note, graded_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [inst.id, f.criterion_id, f.score, f.quote, f.document, f.section, f.verified, f.note, raw.graded_at]
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
