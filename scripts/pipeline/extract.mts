// Step 2: turn each downloaded policy (PDF or HTML) into clean text split by section headings.
// Output: data/extracted/<slug>.json { text, sections: [{ section, title, text }] }.
// A document with too little text (a viewer wrapper, a landing page) is marked not found.
// Usage: npm run extract
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { EXTRACTED, MANIFEST, POLICIES, readManifest, writeJson } from "./common.mts";

const MIN_CHARS = 3000;
type Section = { section: string; title: string; text: string };

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
  if (!m.policy_found || !m.file) { console.log(`skip     ${slug} (no policy)`); continue; }
  try {
    const { lines, pages } = m.kind === "pdf" ? await pdfLines(POLICIES + m.file) : { lines: htmlLines(POLICIES + m.file), pages: null };
    const sections = sectionize(lines);
    const text = sections.map((s) => s.text).join("\n\n");
    if (text.length < MIN_CHARS) {
      m.policy_found = false;
      m.error = `extracted only ${text.length} characters; not a full policy document`;
      console.log(`REJECT   ${slug}: ${m.error}`);
      continue;
    }
    writeJson(`${EXTRACTED}${slug}.json`, { slug, source_url: m.final_url ?? m.url, kind: m.kind, sha256: m.sha256, pages, chars: text.length, sections, text });
    ok++;
    console.log(`ok       ${slug.padEnd(15)} ${String(pages ?? "html").padStart(4)} pages  ${String(text.length).padStart(6)} chars  ${String(sections.length).padStart(3)} sections`);
  } catch (e) {
    console.log(`FAILED   ${slug}: ${(e as Error).message}`);
  }
}
writeJson(MANIFEST, manifest);
console.log(`\n${ok} policies extracted`);
