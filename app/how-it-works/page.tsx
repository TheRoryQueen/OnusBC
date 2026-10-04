import type { Metadata } from "next";
import Link from "next/link";
import rejected from "@/data/grading/rejected-quotes.json";
import sources from "@/data/sources.json";
import institutionsData from "@/data/institutions.json";
import { audit, gradedBy } from "@/lib/graders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "How it works · Onus" };

// How it works (PRD): plain sections, no cards, laid out like the homepage: a 6xl frame, sections split by
// full-width hairlines, each section's serif title on the left (sticky on wide screens) and its content on
// the right; stacked on phones. Everything that looks like data comes from the database or the repo's data
// files at render time: the 17 criteria, a real accepted quote, the real rejected quote, and the rating
// counts by source.

const LETTERS = [["A", "80 to 100"], ["B", "70 to 79"], ["C", "60 to 69"], ["D", "50 to 59"], ["F", "below 50"]];

const FRAME = "mx-auto grid w-full max-w-6xl gap-x-16 gap-y-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]";
const LINK = "text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-16 border-t border-hairline">
      <div className={`${FRAME} py-14 sm:py-16`}>
        <h2 id={`${id}-h`} className="max-w-[12ch] font-serif text-[2.25rem] leading-[1.05] text-text sm:text-[2.75rem] lg:sticky lg:top-24 lg:self-start">{title}</h2>
        <div className="max-w-[64ch] space-y-4 text-[16px] leading-relaxed text-text-secondary [&_strong]:font-semibold [&_strong]:text-text">{children}</div>
      </div>
    </section>
  );
}

// A quote from the grading output: the clause in mono behind a coloured rule (the same treatment as the panel).
function Quote({ verdict, tone, quote, children }: { verdict: string; tone: "brand" | "big-gap"; quote: string; children: React.ReactNode }) {
  return (
    <figure className={`border-l-2 pl-5 ${tone === "brand" ? "border-brand" : "border-big-gap"}`}>
      <p className={`text-[13px] font-medium ${tone === "brand" ? "text-brand" : "text-big-gap"}`}>{verdict}</p>
      <blockquote className="mt-2 font-mono text-[13px] leading-relaxed text-text">&ldquo;{quote}&rdquo;</blockquote>
      <figcaption className="mt-2 text-[13px]">{children}</figcaption>
    </figure>
  );
}

const NAMES = Object.fromEntries((institutionsData as { institutions: { slug: string; short_name: string | null; name: string }[] }).institutions.map((i) => [i.slug, i.short_name ?? i.name]));
const name = (slug: string) => NAMES[slug] ?? slug;
const list = (slugs: string[]) => { const n = slugs.map(name); return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : n.join(""); };

export default async function HowItWorks() {
  const by = gradedBy();
  const supabase = await createClient();
  const [{ data: criteria }, { data: accepted }, { data: counts }] = await Promise.all([
    supabase.from("criteria").select("id, category, label, origin, sort").order("sort"),
    supabase.from("grades").select("quote, document, section, score, institutions(name), criteria(label)").eq("criterion_id", "SR-2").eq("verified", true).eq("score", 2).eq("institutions.slug", "uvic").not("institutions", "is", null).limit(1).maybeSingle(),
    supabase.from("institution_scores").select("n_onus, n_sample, n_public"),
  ]);
  const totals = (counts ?? []).reduce((t, r) => ({ onus: t.onus + (r.n_onus ?? 0), sample: t.sample + (r.n_sample ?? 0), public: t.public + (r.n_public ?? 0) }), { onus: 0, sample: 0, public: 0 });
  const categories = [...new Set((criteria ?? []).map((c) => c.category))];
  const rej = (rejected as { slug: string; criterion_id: string; model_section: string; quote: string }[])[0];
  const { data: rejSchool } = rej ? await supabase.from("institutions").select("name").eq("slug", rej.slug).maybeSingle() : { data: null };
  // Why this quote failed, checked by hand against the extracted text (Oct 3, 2026). Any other rejected quote
  // gets the general explanation.
  const why = rej?.slug === "ecuad" && rej.criterion_id === "AC-2"
    ? <>The policy says &ldquo;Gender based&rdquo;; the AI wrote &ldquo;Gender-Based&rdquo;. Not word for word, so the point didn&apos;t count.</>
    : <>Not found word for word in the policy, so the point didn&apos;t count.</>;
  const acc = accepted as unknown as { quote: string; document: string; section: string; institutions: { name: string } | null; criteria: { label: string } | null } | null;

  return (
    <main className="flex-1 pb-8">
      <article>
        <header className={`${FRAME} pb-16 pt-14 sm:pt-20`}>
          <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[4rem]">How it works</h1>
          <p className="max-w-[46ch] self-end text-[18px] leading-relaxed text-text-secondary">
            Every school gets two grades on the same 0 to 100 scale: one for what its policy promises, one for what students say happens. The gap is the distance between them.
          </p>
        </header>

        <Section id="grades" title="The two grades">
          <p><strong>On paper</strong> is the school&apos;s published sexual violence policy, graded by AI against 17 criteria under a strict rubric, with every point backed by a quote from the policy itself.</p>
          <p><strong>In practice</strong> comes from ratings: a short multiple-choice questionnaire about the reporting process. It shows only once a school has at least 5 ratings.</p>
          <p>Both use the same letters:</p>
          <dl className="grid grid-cols-5 divide-x divide-hairline border-y border-hairline">
            {LETTERS.map(([l, range]) => (
              <div key={l} className="px-2 py-4 text-center sm:px-4 sm:text-left">
                <dt className="font-serif text-[2.25rem] leading-none text-text">{l}</dt>
                <dd className="mt-2 text-[12px] tabular-nums">{range}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="criteria" title="The 17 criteria">
          <p>
            Built from the <a href={sources.rubric.url} target="_blank" rel="noopener noreferrer" className={LINK}>Students for Consent Culture minimum standards</a>, plus a few Onus additions that make a policy usable. Each criterion scores 0 (not addressed), 1 (addressed but vague, permissive or discretionary, like &ldquo;may&rdquo; or &ldquo;where possible&rdquo;) or 2 (an explicit, specific and enforceable commitment: binding words like &ldquo;will&rdquo; or &ldquo;must&rdquo;, with names, steps, numbers or dates a student could hold the school to). A category&apos;s score is its points over the points possible, times 100; the On paper score is the average of the 5 categories, from 0 to 100.
          </p>
          <p>When a school publishes its procedures as a separate document, Onus grades the policy and the procedures together as one text, and every quote shows which document and section it came from.</p>
          <div className="space-y-8 pt-4">
            {categories.map((cat) => (
              <div key={cat}>
                <h3 className="text-[15px] font-semibold text-text">{cat}</h3>
                <ul className="mt-2 divide-y divide-hairline border-t border-hairline">
                  {(criteria ?? []).filter((c) => c.category === cat).map((c) => (
                    <li key={c.id} className="flex items-baseline justify-between gap-4 py-2.5 text-[15px]">
                      <span className="text-text">{c.label}</span>
                      <span className="shrink-0 text-[12px]">{c.origin === "SFCC" ? "SFCC standard" : "Onus addition"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="quote-check" title="The quote check">
          <p>The AI has to quote the exact clause behind every score. Code then looks for that quote, word for word, in the school&apos;s policy text. If it isn&apos;t there, the point doesn&apos;t count.</p>
          <div className="space-y-8 pt-2">
            {acc && (
              <Quote verdict="Accepted" tone="brand" quote={acc.quote}>{acc.institutions?.name}, {acc.criteria?.label}. {acc.document}, {acc.section}. Found word for word: 2 points.</Quote>
            )}
            {rej && (
              <Quote verdict="Rejected" tone="big-gap" quote={rej.quote}>{rejSchool?.name ?? rej.slug}, {rej.model_section}. {why}</Quote>
            )}
          </div>
        </Section>

        <Section id="gap" title="The gap">
          <p>The gap is On paper minus In practice, in grade points.</p>
          <p>
            On the map, each dot is coloured by its On paper grade, from green for an A to red for an F. A ring appears around a dot once the school has at least 5 real ratings: Onus ratings and public records, never sample ratings. A thicker ring means a bigger gap; a ring touching the dot means students rate the school worse than its policy, and a ring with a space before it means better. No ring means there aren&apos;t enough real ratings yet. Each school&apos;s panel shows On paper, In practice and the gap.
          </p>
          <ul className="divide-y divide-hairline border-t border-hairline text-[15px]">
            {[["12.5 or less either way", "Aligned", "bg-brand"], ["More than 12.5 to 37.5", "Some gap", "bg-some-gap"], ["More than 37.5", "Big gap", "bg-big-gap"], ["In practice beats On paper by more than 12.5", "Better in practice", "bg-brand"], ["No public policy found", "No public policy", "bg-no-policy"]].map(([range, word, dot]) => (
              <li key={word} className="flex items-center justify-between gap-4 py-2.5">
                <span>{range}</span>
                <span className="flex items-center gap-2 font-medium text-text"><span className={`size-2.5 rounded-full ${dot}`} aria-hidden />{word}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="review-clock" title="The review clock">
          <p>
            BC law says a school &ldquo;must review its sexual misconduct policy (a) at least once every 3 years&rdquo; (<a href={sources.review_law.url} target="_blank" rel="noopener noreferrer" className={LINK}>Sexual Violence and Misconduct Policy Act, s. 3 (1)</a>), and must consult students when it does (s. 4).
          </p>
          <p>
            For each school, Onus reads the effective, approved or last-revised date printed in its published policy (or, if the policy prints none, its procedures) and shows the exact line it came from. The next review date is that date plus three years. When a document prints no date, the panel says &ldquo;No date published.&rdquo;
          </p>
          <p>
            This is about the <strong>published policy</strong> only. A school may have reviewed its policy and decided not to change it, or changed it without republishing a new date, so a passed date doesn&apos;t mean a school broke the law. It means the published policy is older than the review cycle.
          </p>
          <p>
            The 2025 Sexual Violence Policy Act will replace this law, but it is not yet in force; until it is, the 2016 Act&apos;s three-year review applies.
          </p>
        </Section>

        <Section id="ratings" title="Where ratings come from">
          <p>Each school&apos;s panel counts its ratings by source, so you always know what a grade rests on.</p>
          <p><strong>Onus ({totals.onus} so far).</strong> Real ratings from people who signed in with a school email, including judges during the event.</p>
          <p><strong>Sample ({totals.sample}).</strong> Seed ratings so every school shows an In practice grade before real ones arrive. They are not real people. Every school&apos;s sample centres on the same neutral middle, and only a school&apos;s own published numbers move it: where its annual report gives formal reports received and how many were investigated, that share sets how often a sample rater says the school took action. They will be deleted as real ratings come in.</p>
          <p><strong>Public records ({totals.public}).</strong> Numbers from schools&apos; own annual reports, each linked to the report. They are shown in the panel; they don&apos;t feed the grade directly.</p>
        </Section>

        <Section id="privacy" title="Privacy, plainly">
          <p>Your rating is stored with no link to your account, dates are rounded to the week, and a school&apos;s results appear only after 5 ratings. Each rating has a private code that can delete it; we keep only a scrambled copy, and the code itself stays in your browser, never with your account. There are no free-text boxes in the questionnaire, so no names or stories can be stored. <Link href="/privacy" className={LINK}>Read the privacy policy</Link>.</p>
        </Section>

        <Section id="graders" title="Who graded each policy">
          <p>
            <strong>Gemini</strong> (gemini-3.5-flash, Google) graded {by.gemini.length} schools. Its free daily quota ran out after 7 of the 24 policies on October 4, because retries during a Google outage counted against it, so the other {by.claude.length}, {list(by.claude)}, were graded by <strong>Claude</strong> (claude-opus-5-5, Anthropic) with the same rubric and the same word-for-word quote check. Each school&apos;s panel names its grader.
          </p>
          {audit.agreement && (
            <p>
              As a check, Claude also graded {audit.audit.length === 1 ? "one of Gemini's schools" : `${audit.audit.length} of Gemini's schools`} on its own, from the policy text alone, before seeing Gemini&apos;s answers. That is a small sample: the check was planned for 5 schools, but 4 of them ended up graded by Claude. The two agreed exactly on {audit.agreement.exact} of {audit.agreement.criteria} criterion scores ({Math.round((100 * audit.agreement.exact) / audit.agreement.criteria)}%) and were within one point on {audit.agreement.within_one === audit.agreement.criteria ? `all ${audit.agreement.criteria}` : audit.agreement.within_one}. {audit.audit.map((a) => `${name(a.slug)}: Gemini ${a.gemini.score}, Claude ${a.claude.score}`).join("; ")}.
            </p>
          )}
        </Section>

        <Section id="limits" title="Limits">
          <p>AI can be wrong. The quote check stops it from inventing policy text, but it can still misjudge how strong a clause is. Every score shows its quote so you can judge for yourself, and the second auditor above shows how often two models read the same policy the same way.</p>
          <p>In practice is mostly sample data for now, so the map colours each school by its On paper grade and only draws a gap ring once a school has 5 real ratings.</p>
        </Section>

        <Section id="sources" title="Sources">
          <p>Every number, quote and policy on Onus links to where it came from. <Link href="/sources" className={LINK}>See all sources</Link>.</p>
        </Section>
      </article>
    </main>
  );
}
