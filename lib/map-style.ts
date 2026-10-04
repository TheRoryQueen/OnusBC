// How a school is drawn on the map (one legend, no modes):
// - Fill: the On paper grade, green (A) to red (F), with a dark outline so every dot stands out from the map.
//   No public policy: a hollow dot.
// - Ring: the gap between On paper and In practice, only once a school has at least MIN_REAL real ratings
//   (Onus ratings plus public records; sample ratings never count). Thickness shows the size of the gap;
//   a ring touching the dot means In practice is worse than the policy, a ring with a space before it means
//   better. Rings are ink (blue when better), so they never compete with the grade colours and read without
//   colour. No ring: not enough ratings yet.
import type { InstitutionSummary } from "@/lib/types";

export const MIN_REAL = 5;
export const GRADES = ["A", "B", "C", "D", "F"] as const;
export const gradeToken = (letter: string) => `--onus-grade-${letter.toLowerCase()}`;

export type Ring = { width: number; token: string; detached: boolean; word: string };
export const RINGS: Record<"aligned" | "some_gap" | "big_gap" | "better_in_practice", Ring> = {
  aligned: { width: 1.5, token: "--onus-text-secondary", detached: false, word: "Close to the policy" },
  some_gap: { width: 3, token: "--onus-text", detached: false, word: "Worse than the policy" },
  big_gap: { width: 5, token: "--onus-text", detached: false, word: "Much worse than the policy" },
  better_in_practice: { width: 3, token: "--onus-info", detached: true, word: "Better than the policy" },
};

export const realRatings = (s: InstitutionSummary) => (s.scores?.n_onus ?? 0) + (s.scores?.n_public ?? 0);

export function dotStyle(s: InstitutionSummary): { fill: string | null; hollow: boolean; ring: Ring | null; label: string } {
  if (!s.policy_found) return { fill: null, hollow: true, ring: null, label: "No public policy" };
  const letter = s.scores?.paper_letter ?? null;
  const label = letter ? `On paper ${letter}` : "Grading in progress";
  const gap = s.scores?.gap_label;
  const ring = gap && gap in RINGS && realRatings(s) >= MIN_REAL ? RINGS[gap as keyof typeof RINGS] : null;
  return { fill: letter ? gradeToken(letter) : "--onus-no-policy", hollow: false, ring, label: ring ? `${label}. Students: ${ring.word.toLowerCase()}` : label };
}
