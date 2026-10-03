import type { Metadata } from "next";
import quotes from "@/data/quotes.json";
import sources from "@/data/sources.json";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sources · Onus" };

// Every source behind what Onus shows, read at render time from data/sources.json, data/quotes.json, the
// public_records table and each school's policy links in the institutions table.

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const linkCls = "text-text underline decoration-hairline underline-offset-4 hover:decoration-text";

function Group({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-hairline py-10">
      <h2 id={`${id}-h`} className="text-[19px] font-semibold tracking-tight text-text">{title}</h2>
      {note && <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">{note}</p>}
      <ul className="mt-5 space-y-3.5 text-[15px] leading-relaxed text-text-secondary">{children}</ul>
    </section>
  );
}

export default async function Sources() {
  const supabase = await createClient();
  const [{ data: schools }, { data: records }] = await Promise.all([
    supabase.from("institutions").select("id, slug, name, policy_found, policy_url, procedures_url, policy_note").eq("sector", "public").not("slug", "like", "zz-%").order("name"),
    supabase.from("public_records").select("institution_id, year, metric, value, source_url").order("year", { ascending: false }),
  ]);
  const nameOf = new Map((schools ?? []).map((s) => [s.id, s.name]));
  const recordsBySchool = new Map<string, { year: string; metric: string; value: number; source_url: string }[]>();
  for (const r of records ?? []) {
    const n = nameOf.get(r.institution_id) ?? "";
    recordsBySchool.set(n, [...(recordsBySchool.get(n) ?? []), r]);
  }
  const approved = quotes.quotes.filter((q) => q.approved);
  const victimLink = sources.crisis_lines.find((c) => c.name.startsWith("VictimLinkBC")) as { name: string; phone: string; url: string };

  return (
    <main className="flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <article className="mx-auto w-full max-w-3xl">
        <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[3.75rem]">Sources</h1>
        <p className="mb-8 mt-4 max-w-[56ch] text-[17px] leading-relaxed text-text-secondary">
          Every number, quote and policy on Onus links to where it came from. If a number can&apos;t be sourced, it isn&apos;t shown.
        </p>

        <Group id="national" title="National numbers" note="The homepage's numbers and chart, plus related figures from the same reports.">
          {sources.homepage_stats.map((s) => (
            <li key={s.id}><span className="text-text">{s.value}%</span> {s.label}{s.context ? ` (${s.context})` : ""}. <a href={s.url} {...ext} className={linkCls}>{s.source}</a></li>
          ))}
          <li>
            <span className="text-text">{sources.chart_clearance.title}</span> {sources.chart_clearance.offence}, {sources.chart_clearance.geography}, {sources.chart_clearance.series.years[0]} to {sources.chart_clearance.series.years.at(-1)}. <a href={sources.chart_clearance.url} {...ext} className={linkCls}>{sources.chart_clearance.source}</a>
          </li>
          {sources.optional_stats.map((s) => <li key={s.label}>{s.label}. <a href={s.url} {...ext} className={linkCls}>Statistics Canada, Juristat</a></li>)}
          <li>&ldquo;{sources.policy_requirement.text}&rdquo; <a href={sources.policy_requirement.url} {...ext} className={linkCls}>{sources.policy_requirement.source}</a></li>
        </Group>

        <Group id="rubric" title="The rubric">
          <li><a href={sources.rubric.url} {...ext} className={linkCls}>Students for Consent Culture Canada, {sources.rubric.label}</a>, the basis of the 17 criteria.</li>
          <li><a href={sources.province_lists.policies} {...ext} className={linkCls}>Province of BC, post-secondary sexual violence policies</a>, used to find each school&apos;s policy.</li>
        </Group>

        <Group id="support" title="Support lines">
          <li>Emergency: 911.</li>
          <li>{victimLink.name}: {victimLink.phone}. <a href={victimLink.url} {...ext} className={linkCls}>Province of BC, help on campus</a></li>
          <li>Each school&apos;s support office is listed on <a href="/support" className={linkCls}>Get support</a>, as the school publishes it.</li>
        </Group>

        <Group id="quotes" title="Their words" note="The four quotes on the homepage, verbatim from published reporting. Speakers are not named.">
          {approved.map((q) => (
            <li key={q.id}>&ldquo;{q.text}&rdquo; {q.attribution}. <a href={q.url} {...ext} className={linkCls}>{q.publication}, {q.date}</a></li>
          ))}
        </Group>

        <Group id="records" title="Public records" note="Numbers from schools' own annual reports, shown in each school's panel.">
          {[...recordsBySchool.entries()].map(([school, rows]) => (
            <li key={school}>
              <span className="text-text">{school}</span>
              <ul className="mt-1.5 space-y-1">
                {rows.map((r) => <li key={`${r.metric}${r.year}`}>{r.metric} ({r.year}): {r.value}. <a href={r.source_url} {...ext} className={linkCls}>Report</a></li>)}
              </ul>
            </li>
          ))}
        </Group>

        <Group id="policies" title="Each school's policy" note="What On paper grades. Where a school publishes separate procedures, both are graded together.">
          {(schools ?? []).map((s) => (
            <li key={s.slug}>
              <span className="text-text">{s.name}</span>:{" "}
              {s.policy_url ? <a href={s.policy_url} {...ext} className={linkCls}>Policy</a> : <span>{s.policy_note ?? "No public policy found"}</span>}
              {s.procedures_url && <>, <a href={s.procedures_url} {...ext} className={linkCls}>Procedures</a></>}
              {s.policy_url && !s.policy_found && s.policy_note ? <span> ({s.policy_note})</span> : null}
            </li>
          ))}
        </Group>

        <Group id="maps" title="Maps">
          <li>Map tiles: <a href="https://carto.com/attributions" {...ext} className={linkCls}>CARTO</a>, map data <a href="https://www.openstreetmap.org/copyright" {...ext} className={linkCls}>&copy; OpenStreetMap contributors</a>.</li>
          <li>The homepage and sign-in dotted maps: BC&apos;s outline from <a href="https://www.naturalearthdata.com/" {...ext} className={linkCls}>Natural Earth</a> (public domain).</li>
        </Group>
      </article>
    </main>
  );
}
