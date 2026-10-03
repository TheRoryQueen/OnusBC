import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Grade, InstitutionDetail, InstitutionSummary, Scores } from "@/lib/types";

// Public data only (row level security allows public reads of these tables), so the publishable key is
// enough and no user session is involved.
function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SUMMARY = "id, slug, name, short_name, type, kind, city, lat, lng, policy_found, policy_note, institution_scores(*)";
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function scoresOf(raw: unknown): Scores | null {
  const s = one(raw as Scores | Scores[] | null);
  if (!s) return null;
  return { ...s, paper_gpa: toNum(s.paper_gpa), practice_gpa: toNum(s.practice_gpa), gap: toNum(s.gap) };
}

function summaryOf(row: Record<string, unknown>): InstitutionSummary {
  const { institution_scores, ...rest } = row;
  return { ...(rest as Omit<InstitutionSummary, "scores">), scores: scoresOf(institution_scores) };
}

export async function listInstitutions(): Promise<InstitutionSummary[]> {
  const { data, error } = await db().from("institutions").select(SUMMARY).eq("sector", "public").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => summaryOf(r as Record<string, unknown>));
}

export async function getInstitution(slug: string): Promise<InstitutionDetail | null> {
  const client = db();
  const { data, error } = await client
    .from("institutions")
    .select(`${SUMMARY}, website, policy_url, procedures_url, support_url, contact_office, contact_email, contact_phone, about,
      grades(criterion_id, score, quote, document, section, note, criteria(category, label, sort)),
      public_records(year, metric, value, note, source_url)`)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  type Crit = { category: string; label: string; sort: number };
  const { grades, public_records, ...rest } = data as unknown as Record<string, unknown> & {
    grades: (Omit<Grade, "category" | "label" | "sort"> & { criteria: Crit | Crit[] | null })[];
    public_records: InstitutionDetail["public_records"];
  };
  return {
    ...(summaryOf(rest) as InstitutionSummary),
    ...(rest as unknown as Omit<InstitutionDetail, keyof InstitutionSummary | "grades" | "public_records">),
    scores: scoresOf((rest as Record<string, unknown>).institution_scores),
    grades: (grades ?? [])
      .map(({ criteria, ...g }) => {
        const c = one(criteria);
        return { ...g, category: c?.category ?? "", label: c?.label ?? g.criterion_id, sort: c?.sort ?? 0 };
      })
      .sort((a, b) => a.sort - b.sort),
    public_records: public_records ?? [],
  } as InstitutionDetail;
}
