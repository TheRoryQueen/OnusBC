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
