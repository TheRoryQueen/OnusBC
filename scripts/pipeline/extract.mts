// Step 2: turn each downloaded policy (PDF or HTML) into clean text split by section headings.
// Output: data/extracted/<slug>.json { text, sections: [{ section, title, text }] }.
// A document with too little text (a viewer wrapper, a landing page) is marked not found.
// Usage: npm run extract
import { readFileSync } from "node:fs";
import { EXTRACTED, MANIFEST, POLICIES, readManifest, writeJson } from "./common.mts";
import { MIN_CHARS, extractDocument, type Section } from "../../lib/grading/extract.ts";

const manifest = readManifest();
let ok = 0;
for (const [slug, m] of Object.entries(manifest)) {
  if (!m.policy_found) { console.log(`skip     ${slug} (no public policy)`); continue; }
  try {
    // Policy first, then its procedures: one combined text, every section tagged with its document.
    const sections: Section[] = [];
    const sources: { document: string; url: string; pages: number | null }[] = [];
    for (const d of m.documents.filter((x) => x.file)) {
      const document = d.role === "policy" ? "Policy" : "Procedures";
      const { sections: part, pages, ligature: fixed } = await extractDocument(d.kind === "pdf" ? "pdf" : "html", new Uint8Array(readFileSync(POLICIES + d.file)));
      if (fixed.ligature) console.log(`  ${slug} ${document.toLowerCase()}: repaired unmapped "${fixed.ligature}" ligature (${fixed.words} words, ${(fixed.rate * 100).toFixed(0)}% dictionary words)`);
      else if (fixed.words) console.log(`  ${slug} ${document.toLowerCase()}: ${fixed.words} words contain an unmapped glyph; no ligature fits, left as is`);
      const text = part.map((x) => x.text).join("\n\n");
      if (text.length < MIN_CHARS) throw new Error(`${document.toLowerCase()} extracted only ${text.length} characters; not a full document`);
      sections.push(...part.map((x) => ({ document, ...x }) as Section));
      sources.push({ document, url: d.final_url ?? d.url, pages });
    }
    const text = sections.map((x) => x.text).join("\n\n");
    writeJson(`${EXTRACTED}${slug}.json`, { slug, sha256: m.sha256, documents: sources, chars: text.length, sections, text });
    ok++;
    console.log(`ok       ${slug.padEnd(15)} ${sources.map((x) => `${x.document} ${x.pages ?? "html"}p`).join(" + ").padEnd(30)} ${String(text.length).padStart(6)} chars  ${String(sections.length).padStart(3)} sections`);
  } catch (e) {
    m.policy_found = false;
    m.error = (e as Error).message;
    console.log(`REJECT   ${slug}: ${m.error}`);
  }
}
writeJson(MANIFEST, manifest);
console.log(`\n${ok} policies extracted`);
