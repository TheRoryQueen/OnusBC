import { NextResponse } from "next/server";
import { documentFile } from "@/lib/documents";

// GET /api/documents/<slug>/<policy|procedures> -> the exact copy Onus graded: the PDF itself, or for a
// web-page policy the stored text that was graded, as JSON. Never served for a login-only policy (COTR).
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; role: string }> }) {
  const { slug, role } = await params;
  if (role !== "policy" && role !== "procedures") return NextResponse.json({ error: "No such document." }, { status: 404 });
  const doc = await documentFile(slug, role);
  if (!doc) return NextResponse.json({ error: "This document isn't available." }, { status: 404 });
  if (doc.kind === "pdf") {
    return new Response(doc.body as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${slug}-${role}.pdf"`, "cache-control": "public, max-age=86400" } });
  }
  return NextResponse.json({ sections: doc.sections }, { headers: { "cache-control": "public, max-age=86400" } });
}
