// Step 2: turn each downloaded policy (PDF or HTML) into clean text split by section headings.
// Output: data/extracted/<slug>.json { text, sections: [{ section, title, text }] }.
// A document with too little text (a viewer wrapper, a landing page) is marked not found.
// Usage: npm run extract
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { EXTRACTED, MANIFEST, POLICIES, readManifest, writeJson } from "./common.mts";
import { acronymsIn, formatSectionLabel } from "../../lib/text.ts";

const MIN_CHARS = 3000;

// Some PDFs draw letter pairs ("ti", "fi", ...) as one ligature glyph with no Unicode mapping, which
// comes out as U+FFFD ("inves\uFFFDga\uFFFDon"). Per document, try each common ligature and keep the one
// that turns the affected words into dictionary words; if no ligature clearly wins, leave the text alone
// and flag it, so nothing is guessed.
const DICT = new Set(readFileSync("/usr/share/dict/words", "utf8").split("\n").map((w) => w.toLowerCase()));
const known = (w: string) => DICT.has(w) || DICT.has(w.replace(/(s|es|ed|ing|ly|al|ally|ness|ive|ives)$/, "")) || DICT.has(w.replace(/(s|es)$/, ""));
export function repairLigatures(text: string): { text: string; ligature: string | null; words: number; rate: number } {
  const words = [...new Set(text.match(/[A-Za-z]*\uFFFD[A-Za-z\uFFFD]*/g) ?? [])];
  if (!words.length) return { text, ligature: null, words: 0, rate: 1 };
  const scored = ["ti", "fi", "ft", "tt", "fl", "ff", "ffi", "ffl"].map((lig) => ({
    lig, rate: words.filter((w) => known(w.toLowerCase().replaceAll("\uFFFD", lig))).length / words.length,
  })).sort((a, b) => b.rate - a.rate);
  const [best, second] = scored;
  if (best.rate >= 0.6 && best.rate - second.rate >= 0.4) return { text: text.replaceAll("\uFFFD", best.lig), ligature: best.lig, words: words.length, rate: best.rate };
  return { text, ligature: null, words: words.length, rate: best.rate };
}
type Section = { document?: "Policy" | "Procedures"; section: string; title: string; text: string };

async function pdfLines(path: string): Promise<{ lines: string[]; pages: number }> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true, verbosity: 0 }).promise;
  const pageLines: string[][] = [];
  const marginFlags: boolean[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    // Group text items into visual lines by their baseline, then order left to right.
    const rows: { y: number; items: { x: number; w: number; s: string }[] }[] = [];
    for (const it of content.items as { str: string; transform: number[]; width: number }[]) {
      if (!("str" in it) || it.str === "") continue;
      const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x: it.transform[4], w: it.width, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    // Lines in the top 8% or bottom 10% of the page are marked; they are dropped below only if they
    // repeat on two or more pages (running headers and footers, including a combined document's two
    // different running titles), so real text near a tight margin stays.
    const inMargin = (r: { y: number }) => r.y < height * 0.1 || r.y > height * 0.92;
    marginFlags.push(rows.map(inMargin));
    pageLines.push(rows.map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      let line = "";
      let end = -Infinity;
      for (const it of r.items) {
        if (line && it.x - end > 1 && !line.endsWith(" ") && !it.s.startsWith(" ")) line += " ";
        line += it.s;
        end = it.x + it.w;
      }
      return line.replace(/\s+/g, " ").trim();
    }));
  }
  // Drop running headers and footers: page numbers, and lines repeated on most pages.
  // Compared with digits masked, so "Policy SC17 ... Page 4" and "... Page 5" count as the same footer.
  const key = (l: string) => l.replace(/\d+/g, "#");
  const count = new Map<string, number>();
  for (const lines of pageLines) for (const k of new Set(lines.map(key))) count.set(k, (count.get(k) ?? 0) + 1);
  const repeated = (l: string) => doc.numPages >= 3 && (count.get(key(l)) ?? 0) >= Math.ceil(doc.numPages * 0.6) && l.length < 120;
  const pageNo = /^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i;
  const marginCount = new Map<string, number>();
  pageLines.forEach((lines, p) => {
    for (const k of new Set(lines.filter((_, i) => marginFlags[p][i]).map(key))) marginCount.set(k, (marginCount.get(k) ?? 0) + 1);
  });
  const runningMargin = (l: string, p: number, i: number) => marginFlags[p][i] && l.length < 120 && (marginCount.get(key(l)) ?? 0) >= 2;
  const kept = pageLines.flatMap((lines, p) => lines.filter((l, i) => l && !pageNo.test(l) && !repeated(l) && !runningMargin(l, p, i)));
  return { lines: kept, pages: doc.numPages };
}

function htmlLines(path: string): string[] {
  let html = readFileSync(path, "utf8");
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  html = main
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|button)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h([1-4])[^>]*>/gi, "\n§H ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|table|ul|ol|dd|dt)>|<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&lsquo;|&#8216;/g, "'").replace(/&ldquo;|&rdquo;|&#822[01];/g, '"').replace(/&ndash;|&mdash;/g, "-").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return html.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// Headings: numbered ("4.2 Interim measures"), keyword ("Section 5", "Part II", "Appendix A"),
// short all-caps lines, or HTML headings (marked §H).
function isHeading(l: string): { section: string; title: string } | null {
  if (l.startsWith("§H ")) { const t = l.slice(3).trim(); const n = t.match(/^(\d+(?:\.\d+)*)\.?\s+(.*)$/); return n ? { section: n[1], title: n[2] } : { section: t, title: t }; }
  if (l.length > 90 || /[.;:,]$/.test(l)) return null;
  let m = l.match(/^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-Z][^.]{2,80})$/);
  if (m) return { section: m[1], title: m[2] };
  m = l.match(/^((?:Section|Part|Article|Appendix|Schedule)\s+[0-9IVXLA-Z]+(?:\.\d+)*)[.:\s-]*(.*)$/i);
  if (m) return { section: m[1], title: m[2] || m[1] };
  if (/^[A-Z][A-Z0-9 ,&'()/-]{3,70}$/.test(l) && /[A-Z]{3}/.test(l)) return { section: l, title: l };
  return null;
}

function sectionize(lines: string[]): Section[] {
  const out: Section[] = [{ section: "Preamble", title: "Preamble", text: "" }];
  let part = "";
  for (const l of lines) {
    // Lettered parts ("B. Scope and Limits"): numbered items under them are cited as "B.1".
    const letter = l.length <= 90 && !/[.;:,]$/.test(l) ? l.match(/^([A-H])\.\s+([A-Z][^.]{2,80})$/) : null;
    if (letter) { part = letter[1]; out.push({ section: part, title: letter[2], text: l + "\n" }); continue; }
    const h = isHeading(l);
    if (h && part && /^\d+(\.\d+)*$/.test(h.section)) h.section = `${part}.${h.section}`;
    if (h) out.push({ ...h, text: l.replace(/^§H /, "") + "\n" });
    else out[out.length - 1].text += l + "\n";
  }
  return out.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text.length > 0);
}

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
      const { lines, pages } = d.kind === "pdf" ? await pdfLines(POLICIES + d.file) : { lines: htmlLines(POLICIES + d.file!), pages: null };
      const fixed = repairLigatures(lines.join("\n"));
      if (fixed.ligature) console.log(`  ${slug} ${document.toLowerCase()}: repaired unmapped "${fixed.ligature}" ligature (${fixed.words} words, ${(fixed.rate * 100).toFixed(0)}% dictionary words)`);
      else if (fixed.words) console.log(`  ${slug} ${document.toLowerCase()}: ${fixed.words} words contain an unmapped glyph; no ligature fits, left as is`);
      const acronyms = acronymsIn(fixed.text);
      const part = sectionize(fixed.text.split("\n")).map((x) => ({ ...x, section: formatSectionLabel(x.section, acronyms), title: formatSectionLabel(x.title, acronyms) }));
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
