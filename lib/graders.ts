import graders from "@/data/grading/v2/graders.json";
import comparison from "@/data/grading/v2/comparison.json";

// Who graded each school's policy under the strict rubric (v2), recorded per school from its raw answer
// (data/grading/v2/graders.json, written by npm run compare:v2), and how often the second auditor agreed.
// Shown truthfully in the panel, on How it works and in the open data.
type G = { model: string; by: "gemini" | "claude" };
const G = graders as Record<string, G>;

export const graderOf = (slug: string): G | null => G[slug] ?? null;
export const graderLabel = (g: G) => (g.by === "claude" ? `Claude (${g.model}, Anthropic)` : `Gemini (${g.model}, Google)`);
export const gradedBy = () => {
  const all = Object.entries(G);
  return { gemini: all.filter(([, g]) => g.by === "gemini").map(([s]) => s), claude: all.filter(([, g]) => g.by === "claude").map(([s]) => s) };
};
type Cmp = { agreement: { criteria: number; exact: number; within_one: number } | null; audit: { slug: string; gemini: { score: number; letter: string }; claude: { score: number; letter: string } }[] };
export const audit = comparison as unknown as Cmp;
