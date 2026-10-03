// Review clock: find the effective, approved or last-revised date printed in each school's policy and
// procedures documents (data/policies), with the verbatim line it came from, and write data/review-dates.json.
// Reads every line of every document, headers and footers included (the grading text strips those).
//
// Rules:
// - A date counts when a date label is on the same line, on the line just before (label/value layouts),
//   or in a short all-caps header row just above a line holding only the date (table layouts).
// - Forward-looking dates never count: next review, scheduled review, to be reviewed, superseded, or any
//   date after today.
// - Last revised = the latest remaining date in the policy document; if the policy prints none, the
//   procedures. No date anywhere: "No date published."
// Usage: npm run review-dates [-- --candidates]
import { readFileSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const DIR = new URL("../../data/policies/", import.meta.url);
export type Doc = { role: string; kind: string; file: string; url: string };
export const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8")) as Record<string, { policy_found: boolean; documents?: Doc[] }>;
const TODAY = new Date().toISOString().slice(0, 10);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const mon = (s: string) => MONTHS.indexOf(s.toLowerCase().replace(".", "").slice(0, 3)) + 1;
const ymd = (y: number, m: number, d: number) =>
  !y || m < 1 || m > 12 || d < 0 || d > 31 ? null : `${y}-${String(m).padStart(2, "0")}${d ? `-${String(d).padStart(2, "0")}` : ""}`;
// Most specific first; a later pattern can't reuse text an earlier one matched.
const FORMATS: { re: RegExp; parse: (m: RegExpMatchArray) => string | null }[] = [
  { re: new RegExp(`\\b${MON}\\s+(\\d)\\s(\\d),\\s+(20\\d\\d)\\b`, "gi"), parse: (m) => ymd(+m[4], mon(m[1]), +(m[2] + m[3])) }, // "November 2 8, 2023" (a PDF split the day)
  { re: new RegExp(`\\b${MON}\\s+(\\d{1,2}),?\\s+(20\\d\\d)\\b`, "gi"), parse: (m) => ymd(+m[3], mon(m[1]), +m[2]) },             // May 2, 2023
  { re: new RegExp(`\\b(\\d{1,2})\\s+${MON},?\\s+(20\\d\\d)\\b`, "gi"), parse: (m) => ymd(+m[3], mon(m[2]), +m[1]) },             // 2 May 2023
  { re: new RegExp(`\\b(20\\d\\d)[\\s-]${MON}[\\s-](\\d{1,2})\\b`, "gi"), parse: (m) => ymd(+m[1], mon(m[2]), +m[3]) },           // 2023 DEC 05, 2024-Jun-20
  { re: /\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b/g, parse: (m) => ymd(+m[1], +m[2], +m[3]) },                                   // 2023-05-02, 2024/08/26
  { re: new RegExp(`\\b${MON},?\\s+(20\\d\\d)\\b`, "gi"), parse: (m) => ymd(+m[2], mon(m[1]), 0) },                                  // May 2023
  { re: new RegExp(`\\b(20\\d\\d)\\s+${MON}(?![a-z])`, "gi"), parse: (m) => ymd(+m[1], mon(m[2]), 0) },                              // 2022 Sep
];
const LABEL = /\b(effective|approved|approval|aproval|revised|revision|amended|amendment|last (?:reviewed|updated|update|modified|approved)|date of last|adopted|issued|in force)\b/i;
const FORWARD = /(next\s+review|scheduled\s+review|to\s+be\s+reviewed|review\s+due|supersedes)[^0-9]{0,30}$/i;

function datesIn(text: string) {
  const out: { iso: string; text: string; at: number }[] = [];
  const taken: [number, number][] = [];
  for (const { re, parse } of FORMATS) for (const m of text.matchAll(re)) {
    const s = m.index!, e = s + m[0].length;
    if (taken.some(([a, b]) => s < b && e > a)) continue;
    const iso = parse(m);
    if (iso) { out.push({ iso, text: m[0], at: s }); taken.push([s, e]); }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Small caps often come out letter-split ("A PPROVAL D ATE"); rejoin those so labels can be read.
const tidy = (l: string) => l.replace(/\s+/g, " ").trim().replace(/\b([A-Z]) (?=[A-Z]{2,}\b)/g, "$1");

export async function linesOf(doc: Doc): Promise<string[]> {
  const buf = readFileSync(new URL(doc.file, DIR));
  if (doc.kind === "pdf") {
    const pdf = await getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
    const lines: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      let cur = "";
      for (const it of (await (await pdf.getPage(p)).getTextContent()).items as { str: string; hasEOL?: boolean }[]) {
        cur += it.str;
        if (it.hasEOL) { lines.push(cur); cur = ""; } else cur += " ";
      }
      if (cur.trim()) lines.push(cur);
    }
    return lines.map(tidy).filter(Boolean);
  }
  const html = buf.toString("utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "’").replace(/&#\d+;/g, " ");
  return html.split("\n").map(tidy).filter(Boolean);
}

export type Found = { iso: string; dateText: string; quote: string; role: string; url: string };
async function datesInDoc(doc: Doc): Promise<Found[]> {
  const lines = await linesOf(doc);
  const out: Found[] = [];
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    const prev = i > 0 ? lines[i - 1] : "";
    // Each candidate quote, tried in order: the line itself, the label line plus this value line, or a
    // header row plus the date cell.
    const tries: string[] = [];
    if (LABEL.test(line)) tries.push(line);
    if (prev.length < 60 && LABEL.test(prev) && datesIn(prev).length === 0) tries.push(`${prev} ${line}`);
    const only = datesIn(line);
    if (!tries.length && only.length === 1 && only[0].text.length >= line.length - 2) {
      // Table layout: a date-only cell under a short all-caps header row with a date label.
      const start = Math.max(0, i - 6);
      const firstHead = lines.slice(start, i).findIndex((l) => l.length < 40 && l === l.toUpperCase() && LABEL.test(l));
      if (firstHead >= 0) tries.push(lines.slice(start + firstHead, i + 1).join(" "));
    }
    const quote = tries[0] ?? null;
    if (!quote) return;
    for (const d of datesIn(quote)) {
      const lead = quote.slice(Math.max(0, d.at - 60), d.at);
      if (FORWARD.test(lead)) continue;
      const cmp = d.iso.length === 7 ? `${d.iso}-01` : d.iso;
      if (cmp > TODAY) continue;
      const key = `${d.iso}|${quote}`;
      if (seen.has(key)) continue; // repeated page headers
      seen.add(key);
      out.push({ iso: d.iso, dateText: d.text, quote, role: doc.role, url: doc.url });
    }
  });
  return out;
}

// The later date. On a tie, the stronger label (a revision or amendment says more than an original
// effective date), then the first one found.
const day = (f: Found) => (f.iso.length === 7 ? `${f.iso}-01` : f.iso);
const strength = (f: Found) => (/revis|amend|last (?:review|updat|approv)/i.test(f.quote) ? 2 : /original|created|issued/i.test(f.quote) ? 0 : 1);
const later = (a: Found, b: Found) => (day(b) > day(a) || (day(b) === day(a) && strength(b) > strength(a)) ? b : a);
export async function reviewDates() {
  const schools: Record<string, (Found & { precision: "day" | "month"; from: string; all: number }) | { iso: null; note: string }> = {};
  for (const [slug, entry] of Object.entries(manifest)) {
    const docs = entry.documents ?? [];
    const found: Record<string, Found[]> = {};
    for (const d of docs) found[d.role] = [...(found[d.role] ?? []), ...(await datesInDoc(d))];
    const pick = (found.policy?.length ? found.policy : found.procedures ?? []).reduce<Found | null>((best, f) => (best ? later(best, f) : f), null);
    schools[slug] = pick
      ? { ...pick, precision: pick.iso.length === 7 ? "month" : "day", from: pick.role, all: Object.values(found).flat().length }
      : { iso: null, note: entry.policy_found ? "No date published." : "No public policy: the policy requires a login to read, so no date can be checked." };
  }
  return schools;
}

if (process.argv[1]?.endsWith("/pipeline/dates.mts")) {
  const schools = await reviewDates();
  if (process.argv.includes("--candidates")) {
    for (const [slug, s] of Object.entries(schools)) console.log(slug.padEnd(15), s.iso ?? "-", "|", "quote" in s ? s.quote.slice(0, 140) : s.note);
  }
  writeFileSync(new URL("../../data/review-dates.json", import.meta.url), JSON.stringify({
    _about: "Generated by scripts/pipeline/dates.mts from the policy and procedures documents in data/policies. Each date is the latest effective, approved or revised date printed in the school's policy (or, if the policy prints none, its procedures), with the line it came from.",
    generated_at: TODAY, schools,
  }, null, 2) + "\n");
  console.log(`Wrote data/review-dates.json: ${Object.values(schools).filter((s) => s.iso).length} dated, ${Object.values(schools).filter((s) => !s.iso).length} without a date.`);
}
