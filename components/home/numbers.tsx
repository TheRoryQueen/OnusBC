import sources from "@/data/sources.json";
import { reviewStat } from "@/lib/review-clock";
import { ClearanceChart } from "./clearance-chart";
import { Stat } from "./stat";

// Homepage, second screen (PRD; laid out like CrisisConnect's "Why it matters"). Desktop: headline and text on
// the left; on the right the three numbers in one row, separated by hairlines, with the chart right under
// them. Phones: headline, the three numbers, the chart, then the text. Nothing sticky; about one screen tall
// on a laptop. Every number and claim comes from data/sources.json.
type StatRow = { id: string; value: number; short_label: string; context?: string; url: string };

const SHORT_SOURCE: Record<string, string> = {
  "told-school-women": "StatCan, SISPSP 2019",
  "reported-police": "StatCan, GSS 2019",
  "not-taken-seriously": "StatCan, SISPSP 2019",
};

export function Numbers() {
  const stats = sources.homepage_stats as StatRow[];
  const chart = sources.chart_clearance;
  const rule = sources.policy_requirement;
  const review = reviewStat(); // computed from each published policy's printed date
  const sourceLinks = [
    { label: "StatCan SISPSP 2019", url: stats[0].url },
    { label: "StatCan GSS 2019", url: stats[1].url },
    { label: "StatCan Juristat, clearance trends 2017 to 2022", url: chart.url },
    { label: "BC Ministry of Post-Secondary Education, 2026", url: rule.url },
  ];

  return (
    <section aria-labelledby="numbers-heading" className="border-t border-hairline">
      <div className="mx-auto grid w-full max-w-6xl gap-x-16 gap-y-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-y-12 lg:py-20">
        <h2 id="numbers-heading" className="order-1 max-w-[14ch] self-end font-serif text-[2.5rem] leading-[1.02] text-text sm:text-[3.25rem] lg:col-start-1 lg:row-start-1">
          Most students never tell their school.
        </h2>

        <div className="order-2 grid sm:grid-cols-3 lg:col-start-2 lg:row-start-1">
          {stats.map((s) => (
            <Stat key={s.id} value={s.value} label={s.short_label} context={s.context} source={SHORT_SOURCE[s.id]} url={s.url} />
          ))}
        </div>

        <figure className="order-3 lg:col-start-2 lg:row-start-2">
          <figcaption className="contents">
            <h3 className="text-[17px] font-semibold tracking-tight text-text">{chart.title}</h3>
            <p className="mt-0.5 text-[13px] text-text-secondary">Sexual assaults reported to police in Canada, {chart.series.years[0]} to {chart.series.years.at(-1)}</p>
          </figcaption>
          <ClearanceChart series={chart.series} />
          <p className="mt-1 max-w-[64ch] text-[12px] leading-relaxed text-text-secondary">
            {chart.offence}. {chart.caption} Source: <a href={chart.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">Statistics Canada, Juristat</a>.
          </p>
        </figure>

        <div className="order-4 lg:col-start-1 lg:row-start-2">
          <p className="max-w-[38ch] text-[16px] leading-relaxed text-text-secondary">
            Every public college and university in BC is legally required to have a sexual violence policy and to review it regularly. The national numbers show how rarely students turn to one.
          </p>
          <p className="mt-6 max-w-[22ch] font-serif text-[1.625rem] leading-snug text-text">
            Nobody tracks how each school handles this. Onus does.
          </p>
          <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-text">
            {review.old} of {review.total} published policies are more than three years old.{" "}
            <a href="/how-it-works#review-clock" className="text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current">How this is counted</a>
          </p>
          <p id="sources" className="mt-8 text-[12px] leading-relaxed text-text-secondary">
            Sources:{" "}
            {sourceLinks.map((l, i) => (
              <span key={l.label}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">{l.label}</a>
                {i < sourceLinks.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
