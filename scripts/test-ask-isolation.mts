// Ask can't mix schools. Offline (no AI calls): for 5 schools, search that school with stored passage vectors
// taken from OTHER schools (the closest possible match to another school's text) and confirm every passage
// returned belongs to the selected school; and the quote check refuses a real UBC sentence cited on SFU.
// --live adds one real question on SFU about UBC's policy, which must never quote UBC.
// Usage: npm run test:ask-isolation [-- --live]
import { ask, validate, type Chunk } from "../lib/ask/chain.ts";
import { admin, realDeps, school } from "./lib/ask-deps.mts";
import { dbClient } from "./lib/db.mts";

const db = await dbClient();
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
const SCHOOLS = ["sfu", "ubc-vancouver", "uvic", "kpu", "camosun"];
const ids = Object.fromEntries((await db.query("select slug, id from public.institutions where slug = any($1)", [SCHOOLS])).rows.map((r) => [r.slug, r.id]));

for (const slug of SCHOOLS) {
  // Three passages from other schools, used as the query vector.
  const { rows: probes } = await db.query(
    `select c.embedding::text as v, i.slug from public.policy_chunks c join public.institutions i on i.id = c.institution_id
     where i.slug = any($1) and i.slug <> $2 and c.embedding is not null order by c.id limit 3`, [SCHOOLS, slug]);
  let foreign = 0, total = 0;
  for (const p of probes) {
    const { data, error } = await admin.rpc("match_policy_chunks", { p_institution_id: ids[slug], query_embedding: p.v, k: 20 });
    if (error) throw new Error(error.message);
    const got = (data ?? []).map((c: { id: number }) => c.id);
    total += got.length;
    if (got.length) foreign += (await db.query("select count(*)::int n from public.policy_chunks where id = any($1) and institution_id <> $2", [got, ids[slug]])).rows[0].n;
  }
  check(`${slug}: search with other schools' passages returns only ${slug}'s passages`, total > 0 && foreign === 0, `${total} returned, ${foreign} from another school`);
}

// The quote check: a real UBC sentence can't be cited in an answer about SFU.
const ubc = (await db.query("select c.id, c.content from public.policy_chunks c where c.institution_id = $1 order by c.id limit 1", [ids["ubc-vancouver"]])).rows[0];
const sfu = (await db.query("select c.id, c.document, c.section, c.content from public.policy_chunks c where c.institution_id = $1 order by c.id limit 6", [ids.sfu])).rows as Chunk[];
const ubcQuote = ubc.content.split(/(?<=\.)\s/).find((s: string) => s.length > 40) ?? ubc.content.slice(0, 120);
check("the quote check refuses a UBC sentence cited against SFU's passages", validate({ refused: false, answer: "x", citations: [{ chunk_id: sfu[0].id, quote: ubcQuote }] }, sfu) === null);
check("...and refuses citing a UBC passage id that wasn't retrieved for SFU", validate({ refused: false, answer: "x", citations: [{ chunk_id: ubc.id, quote: ubcQuote }] }, sfu) === null);
const sfuQuote = sfu[0].content.split(/(?<=\.)\s/).find((s: string) => s.length > 40) ?? sfu[0].content.slice(0, 120);
check("...while a real SFU sentence is accepted", validate({ refused: false, answer: "x", citations: [{ chunk_id: sfu[0].id, quote: sfuQuote }] }, sfu) !== null);

if (process.argv.includes("--live")) {
  const s = await school("sfu");
  const q = "What does UBC's policy say about timelines?";
  const r = await ask(realDeps(fetch, () => null, () => {}), { slug: "sfu", school: s.name, question: q, contact: s.contact });
  console.log(`\n[live] ${q}\n${r.answered_by} ${r.model} refused=${r.refused}\n${r.answer}\n${r.citations.map((c) => `  "${c.quote}"`).join("\n")}\n`);
  const ubcText = (await db.query("select string_agg(content, ' ') t from public.policy_chunks where institution_id = $1", [ids["ubc-vancouver"]])).rows[0].t as string;
  const sfuText = (await db.query("select string_agg(content, ' ') t from public.policy_chunks where institution_id = $1", [ids.sfu])).rows[0].t as string;
  check("live: every quote is SFU's own text", r.citations.every((c) => sfuText.includes(c.quote.slice(0, 60))));
  check("live: no quote comes from UBC's policy", r.citations.every((c) => !ubcText.includes(c.quote.slice(0, 60)) || sfuText.includes(c.quote.slice(0, 60))));
  check("live: it answers about SFU or says it can only answer for SFU", r.refused ? /Simon Fraser University/.test(r.answer) : !/\bUBC\b|British Columbia's policy/.test(r.answer.replace(/UBC's policy (?:is not|isn't)[^.]*\./g, "")), r.answer.slice(0, 80));
}
await db.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
