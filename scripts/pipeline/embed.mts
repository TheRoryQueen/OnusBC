// Step 5: chunk each extracted policy by section and embed the chunks with Gemini for retrieval
// by the Ask agent. Stored in public.policy_chunks (no public read; server only).
// Usage: npm run embed -- <slug> [...] | --all
import { existsSync, readFileSync } from "node:fs";
import { dbClient } from "../lib/db.mts";
import { EXTRACTED, gemini, readManifest, sleep } from "./common.mts";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;
const TARGET = 1200; // characters per chunk, well under the model's 2048-token input limit
const OVERLAP = 150;

type Chunk = { section: string; content: string };

export function chunkSections(sections: { section: string; title: string; text: string }[]): Chunk[] {
  const out: Chunk[] = [];
  for (const s of sections) {
    const text = s.text.replace(/\s+\n/g, "\n").trim();
    if (text.length <= TARGET) { out.push({ section: s.section, content: text }); continue; }
    // Split long sections on sentence boundaries, carrying a little overlap for context.
    const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
    let cur = "";
    for (const sent of sentences) {
      if (cur.length + sent.length > TARGET && cur.length > 0) {
        out.push({ section: s.section, content: cur.trim() });
        cur = cur.slice(-OVERLAP) + sent;
      } else cur += sent;
    }
    if (cur.trim()) out.push({ section: s.section, content: cur.trim() });
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
    if (i + 100 < texts.length) await sleep(1000);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const manifest = readManifest();
  const slugs = args.includes("--all") ? Object.keys(manifest).filter((s) => manifest[s].policy_found) : args;
  const db = await dbClient();
  let total = 0;
  for (const slug of slugs) {
    const file = `${EXTRACTED}${slug}.json`;
    if (!existsSync(file)) { console.log(`skip ${slug}: not extracted`); continue; }
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const chunks = chunkSections(doc.sections);
    const vectors = await embedTexts(chunks.map((c) => c.content), "RETRIEVAL_DOCUMENT");
    const inst = (await db.query("select id from public.institutions where slug = $1", [slug])).rows[0];
    await db.query("begin");
    await db.query("delete from public.policy_chunks where institution_id = $1", [inst.id]);
    for (let i = 0; i < chunks.length; i++) {
      await db.query("insert into public.policy_chunks (institution_id, section, content, embedding) values ($1, $2, $3, $4)",
        [inst.id, chunks[i].section, chunks[i].content, `[${vectors[i].join(",")}]`]);
    }
    await db.query("commit");
    total += chunks.length;
    console.log(`${slug.padEnd(15)} ${chunks.length} chunks embedded`);
    await sleep(1500);
  }
  const { rows } = await db.query("select count(*)::int n, count(distinct institution_id)::int s, count(*) filter (where embedding is null)::int missing from public.policy_chunks");
  console.log(`\n${total} chunks this run; database: ${rows[0].n} chunks across ${rows[0].s} schools, ${rows[0].missing} without embeddings`);
  await db.end();
}
