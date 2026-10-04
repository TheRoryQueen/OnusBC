"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ViewerTarget } from "./document-viewer";

// Opens the in-app document viewer from anywhere (a quote in a panel, an Ask citation, the review clock,
// Read the policy). The viewer and PDF.js load only the first time a document is opened.
const DocumentViewer = dynamic(() => import("./document-viewer"), { ssr: false });

type Ctx = { openDocument: (t: ViewerTarget) => void };
const DocViewerContext = createContext<Ctx>({ openDocument: () => {} });
export const useDocViewer = () => useContext(DocViewerContext);

export function DocViewerProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<ViewerTarget | null>(null);
  const close = useCallback(() => setTarget(null), []);
  const value = useMemo(() => ({ openDocument: (t: ViewerTarget) => setTarget(t) }), []);
  return (
    <DocViewerContext.Provider value={value}>
      {children}
      {target && <DocumentViewer key={`${target.slug}-${target.role}-${target.quote ?? ""}`} target={target} onClose={close} />}
    </DocViewerContext.Provider>
  );
}

/** A quote that opens the document at that passage. */
export function QuoteButton({ target, className, children }: { target: ViewerTarget; className?: string; children: React.ReactNode }) {
  const { openDocument } = useDocViewer();
  return (
    <button type="button" onClick={() => openDocument(target)} className={className}>
      {children}
      <span className="sr-only"> Open the {target.role === "procedures" ? "procedures" : "policy"} at this quote.</span>
    </button>
  );
}
