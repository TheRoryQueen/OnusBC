import { NextResponse } from "next/server";
import { getInstitution } from "@/lib/data/institutions";

// GET /api/institutions/:slug -> institution, scores, grades with criteria, public records, contact.
export async function GET(_request: Request, ctx: RouteContext<"/api/institutions/[slug]">) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ error: "Unknown school." }, { status: 404 });
  try {
    const inst = await getInstitution(slug);
    if (!inst) return NextResponse.json({ error: "Unknown school." }, { status: 404 });
    return NextResponse.json(inst, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load this school. Try again in a moment." }, { status: 502 });
  }
}
