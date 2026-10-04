"use client";

import dynamic from "next/dynamic";

// Full-page graded copy (from Sources). The viewer and PDF.js load on this page only.
const DocumentViewer = dynamic(() => import("./document-viewer"), { ssr: false });

export function GradedCopy({ slug, school, role }: { slug: string; school: string; role: "policy" | "procedures" }) {
  return <DocumentViewer target={{ slug, school, role }} mode="page" />;
}
