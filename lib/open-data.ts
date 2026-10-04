import "server-only";
import { graderLabel, graderOf } from "@/lib/graders";
import { createClient } from "@supabase/supabase-js";
import { formatDate, isPastDue, nextReviewBy, reviewFor } from "@/lib/review-clock";

// Open data (/data): the On paper grades and everything behind them, as CSV and JSON. Only published
// policy information and Onus's grading of it: no ratings of any kind (real or sample), and nothing
// about any person. Read with the public (anon) key, the same data the map shows.

export const LICENSE = "Free to use with credit to Onus (onusmap.tech).";

export type SchoolRow = {
  slug: string; name: string; type: string; city: string | null; policy_found: boolean;
  policy_url: string | null; procedures_url: string | null;
  on_paper_score: number | null; on_paper_letter: string | null; graded_by: string | null;
  last_revised: string | null; last_revised_quote: string | null; last_revised_from: string | null;
  next_review_by: string | null; next_review_passed: boolean | null;
};
export type CriterionRow = {
  school_slug: string; school_name: string; criterion_id: string; category: string; criterion: string;
  score: number; quote: string | null; document: string | null; section: string | null; note: string | null;
};

const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

export async function openData() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await db.from("institutions")
    .select("slug, name, type, city, policy_found, policy_url, procedures_url, institution_scores(paper_gpa, paper_letter), grades(criterion_id, score, quote, document, section, note, criteria(category, label, sort))")
    .eq("sector", "public").not("slug", "like", "zz-%").order("name");
  if (error) throw new Error(error.message);
  type Raw = {
    slug: string; name: string; type: string; city: string | null; policy_found: boolean; policy_url: string | null; procedures_url: string | null;
    institution_scores: { paper_gpa: number | null; paper_letter: string | null } | { paper_gpa: number | null; paper_letter: string | null }[] | null;
    grades: { criterion_id: string; score: number; quote: string | null; document: string | null; section: string | null; note: string | null; criteria: { category: string; label: string; sort: number } | { category: string; label: string; sort: number }[] | null }[];
  };
  const schools: SchoolRow[] = [];
  const criteria: CriterionRow[] = [];
  for (const r of (data ?? []) as Raw[]) {
    const sc = one(r.institution_scores);
    const rv = reviewFor(r.slug).date;
    schools.push({
      slug: r.slug, name: r.name, type: r.type, city: r.city, policy_found: r.policy_found,
      policy_url: r.policy_url, procedures_url: r.procedures_url,
      on_paper_score: sc?.paper_gpa != null ? Number(sc.paper_gpa) : null, on_paper_letter: sc?.paper_letter ?? null, graded_by: graderOf(r.slug) ? graderLabel(graderOf(r.slug)!) : null,
      last_revised: rv?.iso ?? null, last_revised_quote: rv?.quote ?? null, last_revised_from: rv?.url ?? null,
      next_review_by: rv ? nextReviewBy(rv.iso) : null, next_review_passed: rv ? isPastDue(rv.iso) : null,
    });
    for (const g of [...r.grades].sort((a, b) => (one(a.criteria)?.sort ?? 0) - (one(b.criteria)?.sort ?? 0))) {
      const c = one(g.criteria);
      criteria.push({
        school_slug: r.slug, school_name: r.name, criterion_id: g.criterion_id, category: c?.category ?? "", criterion: c?.label ?? "",
        score: g.score, quote: g.quote, document: g.document, section: g.section, note: g.note,
      });
    }
  }
  return { schools, criteria };
}

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

export const readableDate = (iso: string | null) => (iso ? formatDate(iso) : "");
