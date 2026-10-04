// Finding a quote in document text, tolerant of the differences between a PDF's text layer and the stored
// quote: curly vs straight quotes, dash styles, soft hyphens, line-break hyphens and runs of whitespace.
// Returns positions in the ORIGINAL text, so the viewer can highlight exactly those characters.

function normChar(c: string) {
  if (/[‘’‚‛′]/.test(c)) return "'";
  if (/[“”„‟″]/.test(c)) return '"';
  if (/[‐‑‒–—―−]/.test(c)) return "-";
  if (/[•●▪]/.test(c)) return " ";
  if (c === "­") return "";
  return c.normalize("NFKC");
}

/** Normalized text plus, for each normalized character, the index of the original character it came from. */
export function normalizeWithMap(text: string) {
  let out = "";
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let c = normChar(text[i]);
    if (!c) continue;
    if (/\s/.test(c)) {
      if (lastSpace) continue;
      c = " ";
      lastSpace = true;
    } else lastSpace = false;
    // A line-break hyphen between letters ("inves- tigation") joins the word.
    if (c !== " " && out.endsWith("- ") && /\p{Ll}/u.test(c) && /\p{L}/u.test(out[out.length - 3] ?? "")) {
      out = out.slice(0, -2);
      map.length -= 2;
    }
    for (const ch of c) { out += ch; map.push(i); }
  }
  return { text: out.trimEnd(), map };
}

export const normalizeQuote = (q: string) => normalizeWithMap(q).text.trim();

/** [start, end) in the original text where the quote occurs, or null. */
export function findQuote(text: string, quote: string): [number, number] | null {
  const q = normalizeQuote(quote);
  if (q.length < 8) return null;
  const { text: n, map } = normalizeWithMap(text);
  const at = n.indexOf(q);
  if (at < 0) return null;
  return [map[at], map[at + q.length - 1] + 1];
}

/** Whether the quote, or a long piece of its start or end, is in this text (to find the right page). */
export function quoteScore(text: string, quote: string): number {
  const n = normalizeWithMap(text).text, q = normalizeQuote(quote);
  if (!q) return 0;
  if (n.includes(q)) return 3;
  const head = q.slice(0, 60), tail = q.slice(-60);
  if (head.length >= 20 && n.includes(head)) return 2;
  if (tail.length >= 20 && n.includes(tail)) return 1;
  return 0;
}

/** For a quote that runs across a page break: the longest start (or end) of the quote, at least 6 words,
 *  found in this page's text. */
export function findQuotePart(text: string, quote: string, part: "start" | "end"): [number, number] | null {
  const words = normalizeQuote(quote).split(" ");
  for (let n = words.length - 1; n >= 6; n--) {
    const piece = part === "start" ? words.slice(0, n).join(" ") : words.slice(words.length - n).join(" ");
    const r = findQuote(text, piece);
    if (r) return r;
  }
  return null;
}
