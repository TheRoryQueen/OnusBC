"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { findQuote, findQuotePart, quoteScore } from "@/lib/quote-match";
import { cn } from "@/lib/utils";
import "./text-layer.css";

// The in-app document viewer: the exact copy Onus graded, with its official source and retrieval date.
// PDFs render with PDF.js; the quote is found in the text layer and highlighted, and the page scrolls to it.
// If the exact words can't be highlighted (a quote that spans pages, or a header line), it opens on the
// right page and shows the quote above it. Web-page policies show the stored text with the passage marked.
// Loaded only when a document is opened, so the map stays fast.

export type ViewerTarget = { slug: string; school: string; role?: "policy" | "procedures"; quote?: string | null };
type DocMeta = { role: "policy" | "procedures"; label: string; kind: "pdf" | "html"; official_url: string; retrieved: string };

const dateFmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

export default function DocumentViewer({ target, mode = "overlay", onClose }: { target: ViewerTarget; mode?: "overlay" | "page"; onClose?: () => void }) {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [role, setRole] = useState<DocMeta["role"] | null>(target.role ?? null);
  const [quote, setQuote] = useState(target.quote ?? null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/documents/${target.slug}`).then((r) => r.json()).then((j: { documents: DocMeta[] }) => {
      if (!alive) return;
      setDocs(j.documents);
      setRole((r) => r && j.documents.some((d) => d.role === r) ? r : j.documents[0]?.role ?? null);
    }).catch(() => alive && setDocs([]));
    return () => { alive = false; };
  }, [target.slug]);

  // Focus the close button on open, return focus on close, Escape closes.
  useEffect(() => {
    if (mode !== "overlay") return;
    returnTo.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); (returnTo.current as HTMLElement | null)?.focus?.(); };
  }, [mode, onClose]);

  const doc = docs?.find((d) => d.role === role) ?? null;
  const switchTo = (r: DocMeta["role"]) => { setRole(r); setQuote(null); };

  return (
    <div
      role={mode === "overlay" ? "dialog" : undefined}
      aria-modal={mode === "overlay" ? true : undefined}
      aria-labelledby="doc-viewer-title"
      className={cn("flex flex-col bg-surface text-text",
        mode === "overlay" ? "fixed inset-0 z-[60] md:inset-y-0 md:left-auto md:right-0 md:w-[min(760px,55vw)] md:shadow-[-24px_0_64px_-24px_rgb(0_0_0/0.35)]" : "min-h-[calc(100dvh-4rem)]")}
    >
      <header className="border-b border-hairline px-4 pb-3 pt-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="doc-viewer-title" className="text-[17px] font-semibold leading-snug">{target.school}{doc ? `, ${doc.label}` : ""}</h2>
            {doc && (
              <p className="mt-1 text-[13px] text-text-secondary">
                Source: <a href={doc.official_url} target="_blank" rel="noopener noreferrer" className="break-all text-brand underline decoration-current/35 underline-offset-2 hover:decoration-current">{doc.official_url}</a>
                <span className="block sm:inline"><span className="hidden sm:inline"> · </span>Retrieved {dateFmt(doc.retrieved)}. This is the exact copy Onus graded.</span>
              </p>
            )}
          </div>
          {mode === "overlay" && (
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close document"
              className="hit grid size-9 shrink-0 place-items-center rounded-full bg-hairline/70 text-text-secondary hover:text-text">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {docs && docs.length > 1 && (
          <div role="tablist" aria-label="Documents" className="mt-3 flex gap-1 rounded-full bg-hairline/50 p-0.5 w-fit">
            {docs.map((d) => (
              <button key={d.role} type="button" role="tab" aria-selected={d.role === role} onClick={() => switchTo(d.role)}
                className={cn("hit min-w-11 rounded-full px-4 py-1.5 text-[13px] transition-colors", d.role === role ? "bg-surface font-medium text-text shadow-sm" : "text-text-secondary hover:text-text")}>
                {d.label}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto bg-page" role={docs && docs.length > 1 ? "tabpanel" : undefined}>
        {docs === null && <Loading />}
        {docs && docs.length === 0 && <p className="p-6 text-[15px] text-text-secondary">This school&apos;s policy isn&apos;t publicly available, so Onus has no copy to show.</p>}
        {doc?.kind === "pdf" && <PdfDoc key={`${target.slug}-${doc.role}-${quote ?? ""}`} url={`/api/documents/${target.slug}/${doc.role}`} quote={quote} />}
        {doc?.kind === "html" && <HtmlDoc key={`${target.slug}-${doc.role}-${quote ?? ""}`} url={`/api/documents/${target.slug}/${doc.role}`} quote={quote} />}
      </div>
    </div>
  );
}

function Loading() {
  return <p role="status" className="flex items-center gap-2 p-6 text-[15px] text-text-secondary"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Opening the document</p>;
}

function QuoteFallback({ quote, page }: { quote: string; page?: number }) {
  return (
    <div role="note" className="mx-4 mt-4 rounded-2xl bg-brand-tint px-4 py-3 sm:mx-6">
      <p className="text-[12px] font-medium text-brand">{page ? `The quoted passage is on page ${page}` : "The quoted passage"}</p>
      <p className="mt-1 font-mono text-[12.5px] leading-relaxed text-text">&ldquo;{quote}&rdquo;</p>
    </div>
  );
}

// ---- PDF
type PdfJs = typeof import("pdfjs-dist");
type PDFDoc = import("pdfjs-dist").PDFDocumentProxy;

function PdfDoc({ url, quote }: { url: string; quote: string | null }) {
  const [pdf, setPdf] = useState<PDFDoc | null>(null);
  const [lib, setLib] = useState<PdfJs | null>(null);
  // split: the quote starts on this page and ends on the next (highlighted in two parts).
  const [target, setTarget] = useState<{ page: number; exact: boolean; split: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ url }).promise;
      if (!alive) return;
      // Find the page with the quote (the whole quote, or failing that its start or end).
      let page = 1, exact = false, split = false;
      if (quote) {
        const scores: number[] = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const tc = await (await doc.getPage(p)).getTextContent();
          const text = (tc.items as { str?: string; hasEOL?: boolean }[]).map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : "")).join("");
          scores[p] = quoteScore(text, quote);
          if (scores[p] === 3) break;
        }
        const full = scores.indexOf(3);
        const start = scores.findIndex((s, p) => s === 2 && scores[p + 1] === 1);
        if (full > 0) { page = full; exact = true; }
        else if (start > 0) { page = start; exact = true; split = true; }
        else { const any = scores.findIndex((s) => s > 0); if (any > 0) page = any; }
      }
      setLib(pdfjs); setPdf(doc); setTarget({ page, exact, split });
    })().catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [url, quote]);

  if (failed) return <p className="p-6 text-[15px] text-text-secondary">The document couldn&apos;t be opened just now.</p>;
  if (!pdf || !lib || !target) return <Loading />;
  return (
    <div ref={scroller}>
      {quote && !target.exact && <QuoteFallback quote={quote} page={target.page} />}
      <ol className="space-y-4 px-2 py-4 sm:px-6">
        {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((n) => (
          <PdfPage key={n} pdf={pdf} lib={lib} n={n} eager={Math.abs(n - target.page) <= 1}
            quote={(n === target.page && target.exact) || (target.split && n === target.page + 1) ? quote : null}
            part={target.split ? (n === target.page ? "start" : "end") : "all"} scrollTo={n === target.page} />
        ))}
      </ol>
    </div>
  );
}

function PdfPage({ pdf, lib, n, eager, quote, part, scrollTo }: { pdf: PDFDoc; lib: PdfJs; n: number; eager: boolean; quote: string | null; part: "all" | "start" | "end"; scrollTo: boolean }) {
  const box = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(eager);
  const [ratio, setRatio] = useState(1.294); // letter size until the page is measured
  const [highlightFailed, setHighlightFailed] = useState(false);

  useEffect(() => {
    if (visible || !box.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: "600px 0px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !box.current) return;
    let alive = true;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const el = box.current!;
      setRatio(base.height / base.width);
      const width = el.clientWidth;
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // A fresh canvas each time, so a cancelled render (React runs effects twice in development) can't collide.
      const canvas = document.createElement("canvas");
      canvas.className = "block"; canvas.setAttribute("aria-hidden", "true");
      el.querySelector("canvas")?.replaceWith(canvas);
      canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      const render = page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      task = render;
      await render.promise;
      if (!alive) return;
      const layer = el.querySelector<HTMLDivElement>(".textLayer")!;
      layer.replaceChildren();
      el.style.setProperty("--scale-factor", String(scale));
      el.style.setProperty("--total-scale-factor", String(scale));
      const tc = await page.getTextContent();
      const tl = new lib.TextLayer({ textContentSource: tc, container: layer, viewport });
      await tl.render();
      if (!alive || !quote) return;
      // Highlight: map the quote's characters back to the text-layer spans that hold them.
      const items = tc.items as { str?: string; hasEOL?: boolean }[];
      const divs = tl.textDivs as HTMLElement[];
      let text = "";
      const owner: number[] = [];
      items.forEach((it, i) => { const s = (it.str ?? "") + (it.hasEOL ? "\n" : ""); for (let k = 0; k < s.length; k++) owner.push(i); text += s; });
      const hit = part === "all" ? findQuote(text, quote) : findQuotePart(text, quote, part);
      if (!hit) { setHighlightFailed(true); return; }
      const marked = new Set<number>();
      for (let c = hit[0]; c < hit[1]; c++) marked.add(owner[c]);
      let first: HTMLElement | null = null;
      [...marked].sort((a, b) => a - b).forEach((i) => { const d = divs[i]; if (d) { d.classList.add("onus-hl"); first ??= d; } });
      if (scrollTo && first) (first as HTMLElement).scrollIntoView({ block: "center" });
    })().catch(() => {}); // a cancelled render (the page scrolled away or the viewer closed)
    return () => { alive = false; task?.cancel(); };
  }, [visible, pdf, lib, n, quote, part, scrollTo]);

  useEffect(() => { if (scrollTo && !quote) box.current?.scrollIntoView({ block: "start" }); }, [scrollTo, quote]);

  return (
    <li ref={box} aria-label={`Page ${n} of ${pdf.numPages}`} className="relative mx-auto w-full max-w-[860px] overflow-hidden rounded-lg bg-white shadow-sm" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas className="block" aria-hidden />
      <div className="textLayer" />
      {highlightFailed && quote && <div className="absolute inset-x-0 top-0"><QuoteFallback quote={quote} page={n} /></div>}
      <span className="pointer-events-none absolute bottom-1 right-2 text-[11px] text-neutral-500" aria-hidden>{n}</span>
    </li>
  );
}

// ---- Web-page policies: the stored text that was graded
function HtmlDoc({ url, quote }: { url: string; quote: string | null }) {
  const [sections, setSections] = useState<{ section: string; title: string; text: string }[] | null>(null);
  const markRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url).then((r) => r.json()).then((j) => alive && setSections(j.sections)).catch(() => alive && setSections([]));
    return () => { alive = false; };
  }, [url]);
  let hit: { i: number; r: [number, number] } | null = null;
  if (sections && quote) for (let i = 0; i < sections.length && !hit; i++) { const r = findQuote(sections[i].text, quote); if (r) hit = { i, r }; }
  const found = !!hit;
  useEffect(() => { if (found) markRef.current?.scrollIntoView({ block: "center" }); }, [found]);
  if (!sections) return <Loading />;
  return (
    <div>
      {quote && !hit && <QuoteFallback quote={quote} />}
      <article className="mx-auto max-w-[68ch] space-y-5 px-4 py-6 text-[15px] leading-relaxed sm:px-6">
        {sections.map((s, i) => {
          const r = hit?.i === i ? hit.r : null;
          return (
            <section key={i}>
              {s.title && s.title !== s.text.split("\n")[0] && <h3 className="mb-1 text-[13px] font-medium text-text-secondary">{s.section !== s.title ? `${s.section} ` : ""}{s.title}</h3>}
              <p className="whitespace-pre-line text-text">
                {r ? <>{s.text.slice(0, r[0])}<mark ref={markRef} className="onus-mark">{s.text.slice(r[0], r[1])}</mark>{s.text.slice(r[1])}</> : s.text}
              </p>
            </section>
          );
        })}
      </article>
    </div>
  );
}
