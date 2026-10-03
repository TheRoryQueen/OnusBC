// Step 5: chunk each extracted policy by section and embed the chunks with Gemini for retrieval
// by the Ask agent. Stored in public.policy_chunks (no public read; server only).
// Usage: npm run embed -- <slug> [...] | --all
import { existsSync, readFileSync } from "node:fs";
import { dbClient } from "../lib/db.mts";
import { EXTRACTED, gemini, readManifest, sleep } from "./common.mts";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;
// ~2,500 characters per chunk (well under the model's 2,048-token input limit) keeps every school within
// the free tier's 1,000 embedding requests a day, with room left for live Ask questions.
const TARGET = 2500;
const OVERLAP = 200;

type Chunk = { document: string; section: string; content: string };

export function chunkSections(sections: { document?: string; section: string; title: string; text: string }[]): Chunk[] {
  const out: Chunk[] = [];
  for (const s of sections) {
    const text = s.text.replace(/\s+\n/g, "\n").trim();
    const document = s.document ?? "Policy";
    if (text.length <= TARGET) { out.push({ document, section: s.section, content: text }); continue; }
    // Split long sections on sentence boundaries, carrying a little overlap for context.
    const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
    let cur = "";
    for (const sent of sentences) {
      if (cur.length + sent.length > TARGET && cur.length > 0) {
        out.push({ document, section: s.section, content: cur.trim() });
        cur = cur.slice(-OVERLAP) + sent;
      } else cur += sent;
    }
    if (cur.trim()) out.push({ document, section: s.section, content: cur.trim() });
  }
  return out.filter((c) => c.content.length >= 40);
}

const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };

export async function embedTexts(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await gemini(`models/${EMBED_MODEL}:batchEmbedContents`, {
      requests: batch.map((text) => ({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] }, taskType, outputDimensionality: EMBED_DIM })),
    });
    // Gemini only pre-normalizes the full-size vector; smaller ones are normalized here for cosine search.
    for (const e of res.embeddings) out.push(unit(e.values));
    if (i + 100 < texts.length) await sleep(61_000); // free tier: 100 embedding requests per minute
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const manifest = readManifest();
  const slugs = args.includes("--all") ? Object.keys(manifest).filter((s) => manifest[s].policy_found) : args;
  const db = await dbClient();
  let total = 0;
  const byHash = new Map<string, number[][]>(); // identical documents (UBC Vancouver and Okanagan) are embedded once
  for (const slug of slugs) {
    const file = `${EXTRACTED}${slug}.json`;
    if (!existsSync(file)) { console.log(`skip ${slug}: not extracted`); continue; }
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const chunks = chunkSections(doc.sections);
    const reused = byHash.get(doc.sha256);
    const vectors = reused ?? await embedTexts(chunks.map((c) => c.content), "RETRIEVAL_DOCUMENT");
    byHash.set(doc.sha256, vectors);
    const inst = (await db.query("select id from public.institutions where slug = $1", [slug])).rows[0];
    await db.query("begin");
    await db.query("delete from public.policy_chunks where institution_id = $1", [inst.id]);
    for (let i = 0; i < chunks.length; i++) {
      await db.query("insert into public.policy_chunks (institution_id, document, section, content, embedding) values ($1, $2, $3, $4, $5)",
        [inst.id, chunks[i].document, chunks[i].section, chunks[i].content, `[${vectors[i].join(",")}]`]);
    }
    await db.query("commit");
    if (!reused) total += chunks.length;
    console.log(`${slug.padEnd(15)} ${chunks.length} chunks ${reused ? "(vectors reused from an identical document)" : "embedded"}`);
    if (!reused) await sleep(61_000); // free tier: 100 embedding requests per minute
  }
  const { rows } = await db.query("select count(*)::int n, count(distinct institution_id)::int s, count(*) filter (where embedding is null)::int missing from public.policy_chunks");
  console.log(`\n${total} embedding requests this run; database: ${rows[0].n} chunks across ${rows[0].s} schools, ${rows[0].missing} without embeddings`);
  await db.end();
}
