import sources from "@/data/sources.json";
import { ClearanceChart } from "./clearance-chart";
import { Stat } from "./stat";

// Homepage, second screen (PRD): three real national statistics on the left, the reported-to-police chart on
// the right, every source linked. Every number comes from data/sources.json.
type StatRow = { id: string; value: number; label: string; context?: string; source: string; url: string };

const SHORT_SOURCE: Record<string, string> = {
  "told-school-women": "Statistics Canada, SISPSP 2019",
  "reported-police": "Statistics Canada, General Social Survey 2019",
  "not-taken-seriously": "Statistics Canada, SISPSP 2019",
};

export function Numbers() {
  const stats = sources.homepage_stats as StatRow[];
  const chart = sources.chart_clearance;
  const sourceLinks = [
    { label: "StatCan SISPSP 2019", url: stats[0].url },
    { label: "StatCan GSS 2019", url: stats[1].url },
    { label: "StatCan Juristat, clearance trends 2017 to 2022", url: chart.url },
  ];

  return (
    <section aria-labelledby="numbers-heading" className="border-t border-hairline">
      <div className="mx-auto grid w-full max-w-6xl gap-x-20 gap-y-16 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <h2 id="numbers-heading" className="max-w-[14ch] font-serif text-[2.75rem] leading-[1.02] text-text sm:text-[3.5rem]">
            Most students never tell their school.
          </h2>
          <div className="mt-12">
            {stats.map((s) => (
              <Stat key={s.id} value={s.value} label={s.label} context={s.context} source={SHORT_SOURCE[s.id] ?? s.source} url={s.url} />
            ))}
          </div>
          <p className="mt-6 max-w-[24ch] font-serif text-[1.75rem] leading-snug text-text">
            Nobody tracks how each school handles this. Onus does.
          </p>
        </div>

        <figure className="self-start lg:sticky lg:top-24 lg:mt-36">
          <figcaption className="contents">
            <h3 className="text-[19px] font-semibold tracking-tight text-text">{chart.title}</h3>
            <p className="mt-1 text-[14px] text-text-secondary">Sexual assaults reported to police in Canada, {chart.series.years[0]} to {chart.series.years.at(-1)}</p>
          </figcaption>
          <ClearanceChart series={chart.series} />
          <p className="max-w-[60ch] text-[12.5px] leading-relaxed text-text-secondary">
            {chart.offence}. {chart.caption} Source: <a href={chart.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">{chart.source}</a>.
          </p>
        </figure>

        <p id="sources" className="text-[13px] leading-relaxed text-text-secondary lg:col-span-2">
          Sources:{" "}
          {sourceLinks.map((l, i) => (
            <span key={l.label}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">{l.label}</a>
              {i < sourceLinks.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
