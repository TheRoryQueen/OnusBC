// Milestone 4 checks. Proves the quote check rejects tampered quotes (so "0 rejected" on a real run
// means the quotes were real, not that the check is broken), then re-checks every grade stored in
// Supabase against the extracted policy text, independently of verify.mts.
// Usage: npm run test:pipeline
import { existsSync, readFileSync } from "node:fs";
import { dbClient } from "./lib/db.mts";
import { normalize } from "../lib/text.ts";
import { RUBRIC } from "./pipeline/rubric.mts";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++;
  else failed++;
};
// Same acceptance rule as verify.mts.
const accepts = (text: string, quote: string) =>
  normalize(quote).length >= 20 && !/\.\.\.|…/.test(quote) && normalize(text).includes(normalize(quote));

console.log("== The quote check rejects what it should ==");
const policy = "4.2 Interim measures\nThe University will provide interim measures, such as changes to class sched-\nules or residence, while a report is investigated. Complainants will be informed of the outcome.";
check("accepts an exact quote", accepts(policy, "The University will provide interim measures, such as changes to class schedules or residence, while a report is investigated."));
check("accepts curly quotes and dashes typed straight", accepts("Students' rights \u2014 \u201Cconsent\u201D is required at all times.", `Students' rights - "consent" is required at all times.`));
check("rejects one changed word (will -> may)", !accepts(policy, "The University may provide interim measures, such as changes to class schedules or residence, while a report is investigated."));
check("rejects a paraphrase", !accepts(policy, "The University provides interim measures like class or residence changes during an investigation."));
check("rejects an ellipsis", !accepts(policy, "The University will provide interim measures ... while a report is investigated."));
check("rejects two passages merged", !accepts(policy, "The University will provide interim measures. Complainants will be informed of the outcome."));
check("rejects a quote too short to mean anything", !accepts(policy, "will provide"));
check("is case-sensitive", !accepts(policy, "the university will provide interim measures, such as changes to class schedules or residence, while a report is investigated."));

console.log("\n== Every grade stored in Supabase ==");
const db = await dbClient();
const { rows } = await db.query(
  `select i.slug, i.policy_found, g.criterion_id, g.score, g.quote, g.document, g.section, g.verified, g.note
   from public.grades g join public.institutions i on i.id = g.institution_id order by i.slug, g.criterion_id`
);
const bySchool = new Map<string, typeof rows>();
for (const r of rows) bySchool.set(r.slug, [...(bySchool.get(r.slug) ?? []), r]);
check("zero unverified quotes stored", rows.every((r) => r.quote === null || r.verified === true), `${rows.length} grades`);
check("every point is backed by a verified quote", rows.every((r) => r.score === 0 || (r.quote && r.verified)));
for (const [slug, gs] of bySchool) {
  if (!gs[0].policy_found) {
    check(`${slug}: login-only policy scores 0 on Publicly posted, nothing else graded`, gs.length === 1 && gs[0].criterion_id === "AC-2" && gs[0].score === 0, gs[0].note ?? "");
    continue;
  }
  const file = `data/extracted/${slug}.json`;
  if (!existsSync(file)) { check(`${slug}: extracted text available to re-check`, false); continue; }
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const sections: { document?: string; section: string; text: string }[] = doc.sections;
  const bad = gs.filter((g) => g.quote && !accepts(doc.text, g.quote));
  check(`${slug}: all ${RUBRIC.length} criteria graded`, gs.length === RUBRIC.length && RUBRIC.every((c) => gs.some((g) => g.criterion_id === c.id)), `${gs.length}`);
  check(`${slug}: every stored quote is verbatim in the policy`, bad.length === 0, bad.map((b) => b.criterion_id).join(","));
  const wrongSection = gs.filter((g) => g.quote && g.section && !sections.some((s) => (s.document ?? "Policy") === g.document && s.section === g.section && normalize(s.text).includes(normalize(g.quote))));
  check(`${slug}: every quote's recorded document and section really contain it`, wrongSection.length === 0, wrongSection.map((b) => b.criterion_id).join(","));
  check(`${slug}: every quote records its document`, gs.every((g) => !g.quote || g.document === "Policy" || g.document === "Procedures"));
}
const graded = [...bySchool.values()].filter((g) => g[0].policy_found).length;
const scores = (await db.query("select count(*)::int n from public.institution_scores where paper_gpa is not null")).rows[0].n;
check("graded schools have an On paper score", scores === graded, `${scores} of ${graded}`);
const grey = (await db.query("select count(*)::int n from public.institutions i join public.institution_scores s on s.institution_id = i.id where not i.policy_found and s.gap_label = 'no_policy'")).rows[0].n;
const notFound = (await db.query("select count(*)::int n from public.institutions where not policy_found")).rows[0].n;
check("every school without a public policy shows grey (no_policy)", grey === notFound, `${grey} of ${notFound}`);
await db.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
