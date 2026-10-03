import { NextResponse } from "next/server";
import { listInstitutions } from "@/lib/data/institutions";

// GET /api/institutions?type=college|university -> list with scores. Cached 60 s; the map also
// subscribes to institution_scores in realtime, so a new rating shows up without waiting for the cache.
export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type");
  try {
    const list = await listInstitutions();
    const out = type === "college" || type === "university" ? list.filter((i) => i.type === type) : list;
    return NextResponse.json(out, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load schools. Try again in a moment." }, { status: 502 });
  }
}
