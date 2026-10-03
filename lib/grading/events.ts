// What /api/grade streams to the "Grade a policy" page, one JSON object per line.
export type Stage = "download" | "extract" | "grade" | "verify";

export type CriterionEvent = {
  type: "criterion";
  criterion_id: string; category: string; label: string;
  /** The model's score, before the quote check. */
  model_score: number;
  /** The score that stands: 0 if the quote wasn't found word for word. */
  score: number;
  quote: string | null; model_quote: string; verified: boolean; reject_reason: string | null;
  document: string | null; section: string | null;
};

export type RunResult = {
  source: { kind: "sample" | "url"; label: string; url: string };
  document: { pages: number | null; chars: number; sections: number };
  criteria: CriterionEvent[];
  paper_gpa: number; paper_letter: string;
  quotes_checked: number; quotes_verified: number; quotes_rejected: number;
  model: string; gemini_calls: number; ms: number; finished_at: string;
};

export type GradeEvent =
  | { type: "stage"; stage: Stage; detail?: string }
  | { type: "document"; pages: number | null; chars: number; sections: number }
  | CriterionEvent
  | { type: "done"; result: RunResult }
  | { type: "error"; message: string; recorded: RunResult | null };

export type Sample = { id: string; name: string; province: string; title: string; url: string; file: string; sha256: string; fetched_at: string };
