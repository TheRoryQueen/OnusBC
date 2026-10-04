// "Listen to this report card": a short spoken summary of a school, built only from stored data (no AI):
// the On paper grade, its strongest and weakest category, the review clock, and how to get support.
// The same text is shown as a transcript under the Listen button.
import { formatDate, isPastDue, nextReviewBy, reviewFor } from "@/lib/review-clock";
import type { InstitutionDetail } from "@/lib/types";

const CATEGORIES = ["Accessible", "Survivor rights", "Process", "Accountability", "Training"];
// As the panel shows them: whole numbers out of 100, categories to one decimal.
const say = (n: number, digits = 1) => n.toFixed(digits).replace(/\.?0+$/, "");
// Spoken phone numbers: digits grouped as written, so text to speech reads them digit by digit.
const spokenPhone = (p: string) => p.replace(/ext\.?/i, "extension").replace(/[.\-]/g, " ").replace(/(\d)/g, "$1 ").replace(/\s+/g, " ").trim();

export function reportCardText(s: InstitutionDetail, { spoken = true, today = new Date() } = {}): string {
  const phone = (p: string) => (spoken ? spokenPhone(p) : p);
  const parts: string[] = [];
  if (!s.policy_found || !s.scores?.paper_letter) {
    parts.push(`${s.name}. Onus could not find a public sexual violence policy for this school, so it has no On paper grade.`);
  } else {
    parts.push(`${s.name}. On paper, its sexual violence policy gets ${/^[AF]/.test(s.scores.paper_letter) ? "an" : "a"} ${s.scores.paper_letter}, ${say(s.scores.paper_gpa!)} out of 100.`);
    const cats = CATEGORIES.map((c) => {
      const g = s.grades.filter((x) => x.category === c);
      return { c, score: g.length ? (g.reduce((a, x) => a + x.score, 0) / (2 * g.length)) * 100 : null };
    }).filter((x): x is { c: string; score: number } => x.score !== null);
    if (cats.length) {
      const best = cats.reduce((a, b) => (b.score > a.score ? b : a));
      const worst = cats.reduce((a, b) => (b.score < a.score ? b : a));
      parts.push(`Its strongest category is ${best.c}, at ${say(best.score)} out of 100. Its weakest is ${worst.c}, at ${say(worst.score)} out of 100.`);
    }
    const r = reviewFor(s.slug);
    if (r.date) {
      const due = formatDate(nextReviewBy(r.date.iso));
      parts.push(`The published policy was last revised ${formatDate(r.date.iso)}. ${isPastDue(r.date.iso, today) ? `BC law requires a review every three years, and the next review date, ${due}, has passed. The school may have reviewed it without publishing a new date.` : `The next review is required by ${due}.`}`);
    } else {
      parts.push("The policy does not publish a revision date.");
    }
  }
  const office = s.contact_office && s.contact_phone ? `${s.contact_office} at ${phone(s.contact_phone)}` : s.contact_office ?? null;
  parts.push(`For support${office ? `, you can contact ${office}, or` : ","} call VictimLinkBC any time at ${spoken ? "1 8 0 0, 5 6 3, 0 8 0 8" : "1-800-563-0808"}. You don't have to report to get support. If you're in danger right now, call ${spoken ? "9 1 1" : "911"}.`);
  return parts.join(" ");
}
