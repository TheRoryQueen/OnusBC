import reviewDates from "@/data/review-dates.json";

// The review clock. BC's Sexual Violence and Misconduct Policy Act, s. 3 (1) (a), requires each school to review
// its sexual misconduct policy at least once every 3 years. Onus can only see the date a school prints on its
// published policy, so it says "published policy last revised", never that a school broke the law: a school
// may have reviewed without republishing. Dates come from data/review-dates.json (scripts/pipeline/dates.mts).

export type ReviewDate = { iso: string; precision: "day" | "month"; quote: string; from: "policy" | "procedures"; url: string };
type Entry = (ReviewDate & { dateText: string; role: string; all: number }) | { iso: null; note: string };
const SCHOOLS = (reviewDates as unknown as { schools: Record<string, Entry> }).schools;

export const REVIEW_YEARS = 3;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function reviewFor(slug: string): { date: ReviewDate | null; note: string | null } {
  const e = SCHOOLS[slug];
  if (!e) return { date: null, note: "No date published." };
  if (e.iso === null) return { date: null, note: e.note };
  return { date: { iso: e.iso, precision: e.precision, quote: e.quote, from: e.from as ReviewDate["from"], url: e.url }, note: null };
}

/** "September 18, 2023" or "September 2022" (when only the month is printed). */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return d ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${y}`;
}
/** The date 3 years on, at the same precision. */
export function nextReviewBy(iso: string) {
  const [y, ...rest] = iso.split("-");
  return [String(Number(y) + REVIEW_YEARS), ...rest].join("-");
}
/** True when the next review date has passed (a month-only date counts from the end of that month). */
export function isPastDue(iso: string, today = new Date()) {
  const [y, m, d] = nextReviewBy(iso).split("-").map(Number);
  const due = d ? new Date(Date.UTC(y, m - 1, d)) : new Date(Date.UTC(y, m, 0));
  return today.getTime() > due.getTime() + 24 * 3600 * 1000 - 1;
}

/** "[n] of [total] published policies are more than three years old": computed, never hardcoded. */
export function reviewStat(today = new Date()) {
  const published = Object.values(SCHOOLS).filter((e) => e.iso !== null || e.note === "No date published.");
  const old = published.filter((e) => e.iso !== null && isPastDue(e.iso, today));
  const undated = published.filter((e) => e.iso === null).length;
  return { old: old.length, total: published.length, undated };
}
