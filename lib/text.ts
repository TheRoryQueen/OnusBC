// Normalization shared by the grading quote check and the Ask citation check. Only typography that
// differs between a document's text layer and how a quote is typed: whitespace, curly quotes, dashes,
// ligatures, soft hyphens, bullets, and words broken across lines with a hyphen. Case is kept.
export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .replace(/­/g, "")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[•●▪]/g, " ")
    .replace(/(\p{L})-\s+(\p{Ll})/gu, "$1$2")
    // A hyphenated compound broken across lines ("Trauma-\nInformed") keeps its hyphen.
    .replace(/(\p{L})-\s+(\p{Lu})/gu, "$1-$2")
    .replace(/\s+/g, " ")
    .trim();
}

// All-caps headings ("PROCEDURES FOR FILING A REPORT") read as shouting in the panel. Labels with no
// lowercase letters are put in sentence case. A word stays upper case if the document itself uses it in
// upper case inside ordinary sentences (an acronym such as EQHR or UBC). Quotes are never changed.
export function acronymsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    if (!/[a-z]/.test(line)) continue; // only learn from ordinary mixed-case lines
    for (const w of line.match(/\b[A-Z][A-Z0-9&]{1,}\b/g) ?? []) out.add(w);
  }
  return out;
}

export function formatSectionLabel(label: string, acronyms: Set<string> = new Set()): string {
  if (/[a-z]/.test(label) || !/[A-Z]{3}/.test(label)) return label;
  const words = label.split(/(\s+)/).map((w) => {
    const bare = w.replace(/[^A-Za-z0-9&]/g, "");
    return acronyms.has(bare) ? w : w.toLowerCase();
  });
  const s = words.join("");
  const i = s.search(/[a-z]/i);
  return i < 0 ? s : s.slice(0, i) + s[i].toUpperCase() + s.slice(i + 1);
}
