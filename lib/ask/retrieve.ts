// Retrieval for the Ask agent: embed the question with Gemini (the main embedding setup, same model
// and size as scripts/pipeline/embed.mts) and fetch the closest chunks for that school only.
import { SwitchableError, type Chunk } from "./chain";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;

type Rpc = (fn: "match_policy_chunks", args: { p_institution_id: string; query_embedding: string; k: number }) =>
  PromiseLike<{ data: { id: number; document: string | null; section: string | null; content: string }[] | null; error: { message: string } | null }>;

export function makeRetrieve(opts: {
  fetch: typeof fetch;
  apiKey: () => string;
  rpc: Rpc;
  institutionId: (slug: string) => Promise<string | null>;
  k?: number;
}) {
  return async (slug: string, question: string, signal: AbortSignal, k?: number): Promise<Chunk[]> => {
    const res = await opts.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey() },
      body: JSON.stringify({ content: { parts: [{ text: question }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: EMBED_DIM }),
    });
    if (res.status === 429) throw new SwitchableError("rate_limit", "HTTP 429 from embeddings");
    if (res.status === 503) throw new SwitchableError("overloaded", "HTTP 503 from embeddings");
    if (!res.ok) throw new Error(`HTTP ${res.status} from embeddings`);
    const values: number[] = (await res.json()).embedding.values;
    const n = Math.hypot(...values);
    const id = await opts.institutionId(slug);
    if (!id) return [];
    const { data, error } = await opts.rpc("match_policy_chunks", {
      p_institution_id: id,
      query_embedding: `[${values.map((v) => v / n).join(",")}]`,
      k: k ?? opts.k ?? 6,
    });
    if (error) throw new Error(`match_policy_chunks: ${error.message}`);
    return (data ?? []).map((c) => ({ id: c.id, document: c.document, section: c.section, content: c.content }));
  };
}
