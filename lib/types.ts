// Shapes shared by the map, the panel and the API routes.
export type GapLabel = "aligned" | "some_gap" | "big_gap" | "better_in_practice" | "no_policy" | "not_enough_ratings" | null;
export type Letter = "A" | "B" | "C" | "D" | "F";

export type Scores = {
  paper_gpa: number | null; paper_letter: Letter | null;
  practice_gpa: number | null; practice_letter: Letter | null; practice_everyone_only: boolean;
  n_public: number; n_onus: number; n_sample: number; n_process: number;
  gap: number | null; gap_label: GapLabel; updated_at: string;
};

export type InstitutionSummary = {
  id: string; slug: string; name: string; short_name: string | null;
  type: "university" | "college"; kind: string | null; city: string | null;
  lat: number; lng: number; policy_found: boolean; policy_note: string | null;
  scores: Scores | null;
};

export type Grade = {
  criterion_id: string; category: string; label: string; sort: number;
  score: number; quote: string | null; document: "Policy" | "Procedures" | null; section: string | null; note: string | null;
};

export type InstitutionDetail = InstitutionSummary & {
  website: string | null; policy_url: string | null; procedures_url: string | null; support_url: string | null;
  contact_office: string | null; contact_email: string | null; contact_phone: string | null; about: string | null;
  grades: Grade[];
  public_records: { year: string; metric: string; value: number; note: string | null; source_url: string }[];
};
