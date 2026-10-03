// Review clock: checks the printed-date extraction against every policy and procedures document.
// Offline (reads data/policies). Usage: npm run test:review-dates
import { linesOf, manifest, reviewDates } from "./pipeline/dates.mts";
import { isPastDue, nextReviewBy, reviewStat } from "../lib/review-clock.ts";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) console.log(`FAIL  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};

// Checked by hand against each document on Oct 3, 2026 (date, document it came from).
const EXPECTED: Record<string, [string, "policy" | "procedures"] | null> = {
  bcit: ["2023-12-05", "policy"], camosun: ["2023-09-18", "policy"], capilano: ["2023-11-28", "policy"], cnc: ["2023-11-29", "policy"],
  "coast-mountain": ["2026-09-25", "policy"], cotr: null, douglas: ["2022-09", "policy"], ecuad: ["2024-01", "procedures"],
  jibc: ["2023-11-23", "policy"], kpu: ["2023-03-03", "policy"], langara: ["2023-11-01", "policy"], nic: ["2023-09-28", "policy"],
  nlc: ["2020-06-30", "policy"], nvit: ["2024-11-26", "policy"], okanagan: ["2026-07-01", "policy"], rru: ["2024-06-20", "policy"],
  selkirk: ["2024-08-26", "policy"], sfu: ["2024-09-26", "policy"], tru: ["2023-07-19", "policy"], "ubc-okanagan": null,
  "ubc-vancouver": null, ufv: ["2024-06-20", "policy"], unbc: ["2020-11-20", "policy"], uvic: ["2025-07-01", "policy"],
  vcc: ["2023-11-22", "policy"], viu: ["2024-05-23", "policy"],
};

const found = await reviewDates();
check("every school in the manifest has a result", Object.keys(manifest).every((s) => s in found), Object.keys(manifest).filter((s) => !(s in found)).join(","));
for (const [slug, exp] of Object.entries(EXPECTED)) {
  const r = found[slug];
  if (!exp) { check(`${slug}: no date published`, r?.iso === null, JSON.stringify(r)); continue; }
  check(`${slug}: date ${exp[0]} from the ${exp[1]}`, !!r && r.iso === exp[0] && "from" in r && r.from === exp[1], r?.iso ?? "none");
  if (!r || r.iso === null) continue;
  // The quote must be text that is really in that document (lines may be joined across a label/value break).
  const doc = manifest[slug].documents!.find((d) => d.role === r.from)!;
  const text = (await linesOf(doc)).join(" ");
  check(`${slug}: the quote is verbatim in the document`, text.includes(r.quote), r.quote);
  check(`${slug}: the quote contains the date as printed`, r.quote.includes(r.dateText), r.dateText);
  check(`${slug}: no forward-looking date was used`, !/(next|scheduled)\s+review[^0-9]{0,20}$/i.test(r.quote.slice(0, r.quote.indexOf(r.dateText))), r.quote);
}
check("next review is the date plus 3 years", nextReviewBy("2023-09-18") === "2026-09-18" && nextReviewBy("2022-09") === "2025-09");
check("a date 3 years and a day old has passed", isPastDue("2023-09-18", new Date("2026-09-19T12:00:00Z")) && !isPastDue("2023-09-18", new Date("2026-09-17T12:00:00Z")));
check("a month-only date passes at the end of that month", !isPastDue("2022-09", new Date("2025-09-20T12:00:00Z")) && isPastDue("2022-09", new Date("2025-10-02T12:00:00Z")));
const stat = reviewStat(new Date("2026-10-03T12:00:00Z"));
check("Oct 3, 2026: 7 of 25 published policies are more than three years old", stat.old === 7 && stat.total === 25, JSON.stringify(stat));

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
