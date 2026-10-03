// Tests the /api/ask fallback chain by forcing each step to fail and checking the next one answers.
// Real Gemini calls (free tier) and real retrieval; failures are injected by wrapping fetch.
//   main -> lite -> cached demo answer -> refusal with the school's contact
// Also checks: switching happens only on rate limit, quota, or timeout (8 s); every answer cites
// retrieved text verbatim; off-policy questions are refused; crisis messages get the crisis response;
// logs name the model and never contain the question.
// Usage: npm run test:ask
import { readFileSync } from "node:fs";
import { DEMO_QUESTION, LITE_MODEL, MAIN_MODEL, STEP_TIMEOUT_MS, ask, normalizeQuestion, validate, type AskResult, type CachedAnswer } from "../lib/ask/chain.ts";
import { normalize } from "../lib/text.ts";
import { realDeps, school, textSearchRetrieve } from "./lib/ask-deps.mts";

const TEXT_RETRIEVAL = process.argv.includes("--text-retrieval");
const depsFor = (f: typeof fetch, c: Parameters<typeof realDeps>[1], l: Parameters<typeof realDeps>[2]) => {
  const d = realDeps(f, c, l);
  return TEXT_RETRIEVAL ? { ...d, retrieve: textSearchRetrieve() } : d;
};

const SLUG = process.env.TEST_ASK_SLUG ?? "ubc-vancouver";
const OFF_POLICY = "What's a good recipe for banana bread?";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++;
  else failed++;
};

type Fault = "rate_limit" | "quota" | "timeout" | "server_error";
// Wraps fetch: requests whose URL contains a key get that fault instead of reaching Google.
function faulty(rules: Record<string, Fault>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const rule = Object.entries(rules).find(([k]) => url.includes(`/models/${k}:`))?.[1];
    if (rule === "rate_limit") return new Response(JSON.stringify({ error: { code: 429, status: "RATE_LIMIT", message: "Too many requests" } }), { status: 429 });
    if (rule === "quota") return new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "You exceeded your current quota" } }), { status: 429 });
    if (rule === "server_error") return new Response(JSON.stringify({ error: { code: 500, message: "internal" } }), { status: 500 });
    if (rule === "timeout") {
      // Hang until the chain gives up on this step.
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }
    return fetch(input, init);
  }) as typeof fetch;
}

const cacheFile = JSON.parse(readFileSync(new URL("../data/ask-cache.json", import.meta.url), "utf8")) as { answers: CachedAnswer[] };
const cache = (slug: string, q: string) => cacheFile.answers.find((a) => a.slug === slug && normalizeQuestion(a.question) === normalizeQuestion(q)) ?? null;

const logs: Record<string, unknown>[] = [];
const s = await school(SLUG);
const QUESTION = "Who will be told if I make a report?";
async function run(question: string, faults: Record<string, Fault> = {}): Promise<{ r: AskResult; log: Record<string, unknown>; ms: number }> {
  const before = logs.length;
  const t = Date.now();
  const r = await ask(depsFor(faulty(faults), cache, (e) => logs.push(e)), { slug: SLUG, school: s.name, question, contact: s.contact });
  const ms = Date.now() - t;
  await new Promise((res) => setTimeout(res, 3000)); // free-tier pacing
  return { r, log: logs[before], ms };
}
// Every answer that is not a refusal must cite text that is really in this school's policy chunks.
async function citationsAreReal(r: AskResult) {
  const { admin } = await import("./lib/ask-deps.mts");
  const { data } = await admin.from("policy_chunks").select("content").eq("institution_id", s.id);
  const corpus = normalize((data ?? []).map((c) => c.content).join("\n"));
  return r.citations.length > 0 && r.citations.every((c) => corpus.includes(normalize(c.quote)));
}

if (TEXT_RETRIEVAL) console.log("WARNING: retrieval is STUBBED with Postgres full-text search (embedding quota used up).\nModels, timeouts, fallbacks and citation checks are live. Re-run without --text-retrieval after the quota resets.\n");
console.log(`School: ${s.name} (${SLUG}); main ${MAIN_MODEL}, lite ${LITE_MODEL}, ${STEP_TIMEOUT_MS} ms per step\n`);

// 1. Healthy chain: the main model answers.
{
  const { r, log } = await run(QUESTION);
  check("1. main model answers when nothing fails", r.answered_by === "main" && !r.refused, `${r.answered_by}${r.refused ? " (refused)" : ""}`);
  check("   answer cites at least one section, quotes are verbatim in the retrieved policy", await citationsAreReal(r), r.citations.map((c) => c.section).join(", "));
  check("   log names the model", log?.model === MAIN_MODEL);
}

// 2. Main rate-limited: the lite model answers.
{
  const { r, log } = await run(QUESTION, { [MAIN_MODEL]: "rate_limit" });
  check("2. main rate-limited -> lite model answers", r.answered_by === "lite" && !r.refused, `${r.answered_by}`);
  check("   lite answer follows the same citation rules", await citationsAreReal(r));
  check("   log records the skip and the model that answered", log?.model === LITE_MODEL && JSON.stringify(log?.skipped) === JSON.stringify(["main:rate_limit"]), JSON.stringify(log?.skipped));
}

// 3. Main out of quota: the lite model answers.
{
  const { r, log } = await run(QUESTION, { [MAIN_MODEL]: "quota" });
  check("3. main out of quota -> lite model answers", r.answered_by === "lite" && !r.refused, `${r.answered_by} ${JSON.stringify(log?.skipped)}`);
}

// 4. Main times out (8 s) and lite is rate-limited: the cached demo answer is used.
{
  const hasCache = !!cache(SLUG, DEMO_QUESTION);
  check("   a verified cached demo answer exists for this school", hasCache);
  const { r, log, ms } = await run(DEMO_QUESTION, { [MAIN_MODEL]: "timeout", [LITE_MODEL]: "rate_limit" });
  check("4. main timeout + lite rate-limited -> cached demo answer", r.answered_by === "cache" && !r.refused && r.citations.length > 0, `${r.answered_by} ${JSON.stringify(log?.skipped)}`);
  check("   main step was abandoned at the 8 s timeout", ms >= STEP_TIMEOUT_MS && ms < STEP_TIMEOUT_MS + 6000, `${(ms / 1000).toFixed(1)} s`);
  check("   cached answer's quotes are verbatim in the policy", await citationsAreReal(r));
}

// 5. Embeddings rate-limited (retrieval fails in both model steps): cache, since it's the demo question.
if (TEXT_RETRIEVAL) console.log("SKIP  5. embeddings rate-limited (needs real embedding retrieval)");
else {
  const { r } = await run(DEMO_QUESTION, { "gemini-embedding-001": "rate_limit" });
  check("5. embeddings rate-limited -> cached demo answer", r.answered_by === "cache", r.answered_by);
}

// 6. Everything fails and the question has no cached answer: refusal with the school's contact.
{
  const { r } = await run(QUESTION, { [MAIN_MODEL]: "quota", [LITE_MODEL]: "timeout" });
  check("6. all steps fail, no cache for this question -> refusal with the school's contact", r.answered_by === "fallback" && r.refused && r.citations.length === 0, r.answered_by);
  check("   refusal names the school and its office", r.answer.startsWith(`That's outside what I can answer from ${s.name}'s policy.`) && !!s.contact.office && r.answer.includes(s.contact.office!), r.answer);
}

// 7. A non-switchable error (500) does not fall through to the lite model or the cache.
{
  const { r, log } = await run(DEMO_QUESTION, { [MAIN_MODEL]: "server_error" });
  check("7. main returns 500 -> no switch: straight to the refusal fallback", r.answered_by === "fallback" && log?.error === "non_switchable", `${r.answered_by} ${String(log?.error)}`);
}

// 8. Off-policy question with a healthy chain: refused with the contact, no citations.
{
  const { r } = await run(OFF_POLICY);
  check("8. off-policy question is refused with the school's contact", r.refused && r.citations.length === 0 && r.answer.includes(s.name), `${r.answered_by}`);
}

// 9. Off-policy question through the lite model: same rule.
{
  const { r } = await run(OFF_POLICY, { [MAIN_MODEL]: "rate_limit" });
  check("9. off-policy question through the lite model is also refused", r.refused && r.citations.length === 0, `${r.answered_by} ${r.model}`);
}

// 10. Crisis message: crisis response before any model call.
{
  let calls = 0;
  const counting = (async (i: RequestInfo | URL, init?: RequestInit) => { calls++; return fetch(i, init); }) as typeof fetch;
  const r = await ask(depsFor(counting, cache, (e) => logs.push(e)), { slug: SLUG, school: s.name, question: "I'm not safe right now, he's here", contact: s.contact });
  check("10. crisis message gets the crisis response with 911 and VictimLinkBC, no model call", r.crisis && r.answer.includes("911") && r.answer.includes("1-800-563-0808") && calls === 0, `calls=${calls}`);
}

// 11. The citation rule rejects an answer whose quote is not in the retrieved text.
{
  const chunks = [{ id: 1, section: "4.2", content: "The Investigations Office will inform the Complainant of the outcome." }];
  check("11. invented quote -> answer rejected", validate({ refused: false, answer: "x", citations: [{ chunk_id: 1, quote: "The University will always expel the respondent." }] }, chunks) === null);
  check("    quote cited from a chunk that was not retrieved -> rejected", validate({ refused: false, answer: "x", citations: [{ chunk_id: 9, quote: "The Investigations Office will inform the Complainant" }] }, chunks) === null);
  check("    answer with no citation -> rejected", validate({ refused: false, answer: "x", citations: [] }, chunks) === null);
  check("    real quote (curly vs straight quotes, extra spaces) -> accepted", validate({ refused: false, answer: "x", citations: [{ chunk_id: 1, quote: "The Investigations  Office will inform the Complainant of the outcome." }] }, chunks)?.[0].section === "4.2");
}

// 12. Logs: model named, question never present.
{
  const all = JSON.stringify(logs);
  check("12. logs never contain the question text", ![QUESTION, DEMO_QUESTION, OFF_POLICY, "he's here"].some((q) => all.includes(q)));
  check("    every log line names which step answered", logs.every((l) => typeof l.answered_by === "string"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
