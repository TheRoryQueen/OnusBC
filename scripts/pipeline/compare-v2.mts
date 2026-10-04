// Rubric v2 review, before anything reaches the database: each school's v2 On paper score (Gemini's answer
// put through the same verbatim quote check as verify.mts), next to its live v1 grade; and the second
// auditor's agreement with Gemini on the schools it graded. Writes data/grading/v2/comparison.json and data/grading/v2/graders.json.
// Usage: npm run compare:v2
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { checkItem, letterFor, paperGpa, quoteIndex, type Item } from "../../lib/grading/grader.ts";
import { RUBRIC } from "../../lib/grading/rubric.ts";

const V1 = "data/grading/", V2 = "data/grading/v2/";
const score = (slug: string, items: Item[]) => {
  const doc = JSON.parse(readFileSync(`data/extracted/${slug}.json`, "utf8"));
  const idx = quoteIndex(doc.sections);
  const finals = RUBRIC.map((c) => checkItem(c.id, items.find((i) => i.criterion_id === c.id), idx));
  const s = paperGpa(finals);
  return { score: s, letter: letterFor(s), finals, rejected: finals.filter((f) => f.reject_reason).length };
};

const rows: unknown[] = [];
// Who graded each school (shown in its panel, on How it works and in the open data): the model named in
// its raw answer. Schools sharing a document (UBC's two campuses) carry the grader of the shared answer.
const graders: Record<string, { model: string; by: "gemini" | "claude" }> = {};
for (const f of readdirSync(V2).filter((x) => x.endsWith(".raw.json")).sort()) {
  const raw = JSON.parse(readFileSync(V2 + f, "utf8"));
  const v2 = score(raw.slug, raw.items);
  const v1 = existsSync(`${V1}${raw.slug}.json`) ? JSON.parse(readFileSync(`${V1}${raw.slug}.json`, "utf8")) : null;
  graders[raw.slug] = { model: raw.model, by: /^claude/.test(raw.model) ? "claude" : "gemini" };
  rows.push({ slug: raw.slug, grader: raw.model, v1: v1 ? { gpa: v1.paper_gpa, letter: v1.paper_letter } : null, v2: { score: v2.score, letter: v2.letter, quotes_rejected: v2.rejected } });
  console.log(`${raw.slug.padEnd(16)} v1 ${v1 ? `${String(v1.paper_gpa).padEnd(5)} ${v1.paper_letter}` : "-      "}   v2 ${String(v2.score).padStart(3)} ${v2.letter}   (${v2.rejected} quotes rejected)   ${raw.model}`);
}

// Agreement: the second auditor against Gemini, per criterion, on the final (quote-checked) scores.
const audit: unknown[] = [];
let exact = 0, within1 = 0, n = 0;
const disagreements: unknown[] = [];
for (const f of existsSync(`${V2}audit`) ? readdirSync(`${V2}audit`) : []) {
  const a = JSON.parse(readFileSync(`${V2}audit/${f}`, "utf8"));
  if (!existsSync(`${V2}${a.slug}.raw.json`)) continue;
  // An audit counts only where Gemini graded the school (otherwise the audit grade is the school's grade).
  if (/^claude/.test(JSON.parse(readFileSync(`${V2}${a.slug}.raw.json`, "utf8")).model)) continue;
  const g = score(a.slug, JSON.parse(readFileSync(`${V2}${a.slug}.raw.json`, "utf8")).items);
  const c = score(a.slug, a.items.map((i: Item) => ({ ...i, reason: "" })));
  for (const crit of RUBRIC) {
    const gs = g.finals.find((x) => x.criterion_id === crit.id)!.score, cs = c.finals.find((x) => x.criterion_id === crit.id)!.score;
    n++; if (gs === cs) exact++; if (Math.abs(gs - cs) <= 1) within1++;
    if (gs !== cs) disagreements.push({ slug: a.slug, criterion: crit.id, label: crit.label, gemini: gs, claude: cs,
      gemini_quote: g.finals.find((x) => x.criterion_id === crit.id)!.quote, claude_quote: c.finals.find((x) => x.criterion_id === crit.id)!.quote });
  }
  audit.push({ slug: a.slug, gemini: { score: g.score, letter: g.letter }, claude: { score: c.score, letter: c.letter } });
  console.log(`audit ${a.slug.padEnd(14)} Gemini ${g.score} ${g.letter}   Claude ${c.score} ${c.letter}`);
}
if (n) console.log(`\nAgreement over ${n} criterion scores: exact ${exact} (${Math.round((100 * exact) / n)}%), within one point ${within1} (${Math.round((100 * within1) / n)}%)`);
writeFileSync(`${V2}graders.json`, JSON.stringify(graders, null, 1) + "\n");
writeFileSync(`${V2}comparison.json`, JSON.stringify({ generated_at: new Date().toISOString(), schools: rows, audit, agreement: n ? { criteria: n, exact, within_one: within1 } : null, disagreements }, null, 2) + "\n");
