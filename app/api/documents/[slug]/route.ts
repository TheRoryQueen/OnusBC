import { NextResponse } from "next/server";
import { documentsFor } from "@/lib/documents";

// GET /api/documents/<slug> -> the graded documents for a school: role, label, kind, official URL and the
// date they were retrieved. Empty for a school whose policy isn't public (COTR).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return NextResponse.json({ documents: documentsFor(slug) }, { headers: { "cache-control": "public, max-age=3600" } });
}
