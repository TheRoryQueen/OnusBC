// Display rules for grades and the gap (docs/PRD.md, Grading system). Colour is always paired with a word.
import type { GapLabel, Letter, Scores } from "@/lib/types";

export type GapVariant = "aligned" | "some-gap" | "big-gap" | "no-policy" | "neutral";

export function gapDisplay(label: GapLabel, policyFound: boolean): { word: string; variant: GapVariant; token: string } {
  if (!policyFound || label === "no_policy") return { word: "No public policy", variant: "no-policy", token: "--onus-no-policy" };
  switch (label) {
    case "aligned": return { word: "Aligned", variant: "aligned", token: "--onus-brand" };
    case "better_in_practice": return { word: "Better in practice", variant: "aligned", token: "--onus-brand" };
    case "some_gap": return { word: "Some gap", variant: "some-gap", token: "--onus-some-gap" };
    case "big_gap": return { word: "Big gap", variant: "big-gap", token: "--onus-big-gap" };
    case "not_enough_ratings": return { word: "Not enough ratings yet", variant: "neutral", token: "--onus-text-secondary" };
    default: return { word: "Grading in progress", variant: "neutral", token: "--onus-text-secondary" };
  }
}

/** The PRD: a school with a policy but no grades yet shows "Grading in progress". */
export const isGraded = (s: Scores | null, policyFound: boolean) => policyFound && !!s?.paper_letter;

export const letterOrDash = (l: Letter | null | undefined) => l ?? "None";

export function ratingCountLine(s: Scores | null) {
  const n = (x: number | undefined) => x ?? 0;
  return `${n(s?.n_public)} public records · ${n(s?.n_onus)} Onus · ${n(s?.n_sample)} sample`;
}
