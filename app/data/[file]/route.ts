import { NextResponse } from "next/server";
import { LICENSE, openData, toCsv } from "@/lib/open-data";

// /data/onus-schools.csv, /data/onus-criteria.csv, /data/onus.json: Onus's open data (lib/open-data.ts).
// No ratings and nothing personal. Rebuilt from the database at most once an hour.
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const data = await openData();
  const download = (body: string, type: string) =>
    new Response(body, { headers: { "content-type": `${type}; charset=utf-8`, "content-disposition": `attachment; filename="${file}"`, "cache-control": "public, max-age=3600" } });
  if (file === "onus-schools.csv") return download(toCsv(data.schools), "text/csv");
  if (file === "onus-criteria.csv") return download(toCsv(data.criteria), "text/csv");
  if (file === "onus.json") {
    return download(JSON.stringify({
      license: LICENSE,
      source: "https://onusmap.tech/data",
      generated_at: new Date().toISOString(),
      about: "On paper grades of BC public colleges and universities' sexual violence policies, graded against 17 criteria; every score of 1 or 2 quotes the policy word for word. Review dates are the latest date printed in each published policy. No ratings data and nothing personal.",
      schools: data.schools,
      criteria: data.criteria,
    }, null, 2) + "\n", "application/json");
  }
  return NextResponse.json({ error: "No such file." }, { status: 404 });
}
