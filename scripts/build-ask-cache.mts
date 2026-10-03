// Generates the cached answer to the demo question for each given school by running the real chain
// (main, then lite model). Saved only if the answer passed the citation check. Never hand-written.
// Usage: npm run build:ask-cache -- <slug> [...]
import { readFileSync } from "node:fs";
import { DEMO_QUESTION, ask, normalizeQuestion, type CachedAnswer } from "../lib/ask/chain.ts";
import { realDeps, school, textSearchRetrieve } from "./lib/ask-deps.mts";

const TEXT_RETRIEVAL = process.argv.includes("--text-retrieval");

const path = new URL("../data/ask-cache.json", import.meta.url).pathname;
const file = JSON.parse(readFileSync(path, "utf8")) as { _about: string; answers: CachedAnswer[] };
for (const slug of process.argv.slice(2).filter((a) => !a.startsWith("--"))) {
  const s = await school(slug);
  const deps = realDeps(fetch, () => null, () => {});
  const r = await ask(TEXT_RETRIEVAL ? { ...deps, retrieve: textSearchRetrieve() } : deps, { slug, school: s.name, question: DEMO_QUESTION, contact: s.contact });
  if (r.refused || r.crisis || !r.citations.length || (r.answered_by !== "main" && r.answered_by !== "lite")) {
    console.log(`${slug}: not cached (${r.answered_by}${r.refused ? ", refused" : ""})`);
    continue;
  }
  file.answers = file.answers.filter((a) => !(a.slug === slug && normalizeQuestion(a.question) === normalizeQuestion(DEMO_QUESTION)));
  file.answers.push({ slug, question: DEMO_QUESTION, answer: r.answer, citations: r.citations, generated_by: r.model!, generated_at: new Date().toISOString(), ...(TEXT_RETRIEVAL ? { retrieval: "text-search (regenerate with embeddings)" } : {}) });
  console.log(`${slug}: cached (${r.model}, ${r.citations.length} citation${r.citations.length > 1 ? "s" : ""}: ${r.citations.map((c) => c.section).join(", ")})`);
  await new Promise((res) => setTimeout(res, 4000));
}
(await import("node:fs")).writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
