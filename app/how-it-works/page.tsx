import type { Metadata } from "next";
import Link from "next/link";
import rejected from "@/data/grading/rejected-quotes.json";
import sources from "@/data/sources.json";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "How it works · Onus" };

// How it works (PRD): plain sections, no cards. Everything that looks like data comes from the database or
// the repo's data files at render time: the 17 criteria, a real accepted quote, the real rejected quote,
// and the rating counts by source.

const LETTERS = [["A", "3.5 to 4.0"], ["B", "2.5 to 3.4"], ["C", "1.5 to 2.4"], ["D", "0.5 to 1.4"], ["F", "below 0.5"]];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-hairline py-12">
      <h2 id={`${id}-h`} className="font-serif text-[2rem] leading-tight text-text sm:text-[2.25rem]">{title}</h2>
      <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-text-secondary [&_strong]:font-semibold [&_strong]:text-text">{children}</div>
    </section>
  );
}

export default async function HowItWorks() {
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
    <main className="flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <article className="mx-auto w-full max-w-3xl">
        <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[3.75rem]">How it works</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-text-secondary">
          Every school gets two grades on the same 0 to 4 scale: one for what its policy promises, one for what students say happens. The gap is the distance between them.
        </p>

        <Section id="grades" title="The two grades">
          <p><strong>On paper</strong> is the school&apos;s published sexual violence policy, graded by AI against 17 criteria, with every point backed by a quote from the policy itself.</p>
          <p><strong>In practice</strong> comes from ratings: a short multiple-choice questionnaire about the reporting process. It shows only once a school has at least 5 ratings.</p>
          <p>Both use the same letters:</p>
          <dl className="grid grid-cols-5 gap-2 text-center">
            {LETTERS.map(([l, range]) => (
              <div key={l} className="rounded-2xl bg-hairline/40 px-2 py-3">
                <dt className="font-serif text-[1.75rem] leading-none text-text">{l}</dt>
                <dd className="mt-1 text-[12px] tabular-nums">{range}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="criteria" title="The 17 criteria">
          <p>
            Built from the <a href={sources.rubric.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current">Students for Consent Culture minimum standards</a>, plus a few Onus additions that make a policy usable. Each criterion scores 0 (not addressed), 1 (mentioned but vague or optional, like &ldquo;may&rdquo;) or 2 (explicit and binding, like &ldquo;will&rdquo; or &ldquo;must&rdquo;). A category&apos;s score is its points over the points possible, times 4; the On paper grade is the average of the 5 categories.
          </p>
          <p>When a school publishes its procedures as a separate document, Onus grades the policy and the procedures together as one text, and every quote shows which document and section it came from.</p>
          <div className="space-y-6 pt-2">
            {categories.map((cat) => (
              <div key={cat}>
                <h3 className="text-[15px] font-semibold text-text">{cat}</h3>
                <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
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
          {acc && (
            <figure className="rounded-2xl bg-hairline/40 px-5 py-4">
              <p className="text-[13px] font-medium text-brand">Accepted</p>
              <blockquote className="mt-2 font-mono text-[13px] leading-relaxed text-text">&ldquo;{acc.quote}&rdquo;</blockquote>
              <figcaption className="mt-2 text-[13px]">{acc.institutions?.name}, {acc.criteria?.label}. {acc.document}, {acc.section}. Found word for word: 2 points.</figcaption>
            </figure>
          )}
          {rej && (
            <figure className="rounded-2xl bg-hairline/40 px-5 py-4">
              <p className="text-[13px] font-medium text-big-gap">Rejected</p>
              <blockquote className="mt-2 font-mono text-[13px] leading-relaxed text-text">&ldquo;{rej.quote}&rdquo;</blockquote>
              <figcaption className="mt-2 text-[13px]">{rejSchool?.name ?? rej.slug}, {rej.model_section}. {why}</figcaption>
            </figure>
          )}
        </Section>

        <Section id="gap" title="The gap">
          <p>The gap is On paper minus In practice, in grade points.</p>
          <p>
            On the map, each dot is coloured by its On paper grade, from green for an A to red for an F. A ring appears around a dot once the school has at least 5 real ratings: Onus ratings and public records, never sample ratings. A thicker ring means a bigger gap; a ring touching the dot means students rate the school worse than its policy, and a ring with a space before it means better. No ring means there aren&apos;t enough real ratings yet. Each school&apos;s panel shows On paper, In practice and the gap.
          </p>
          <ul className="divide-y divide-hairline border-y border-hairline text-[15px]">
            {[["0.5 or less either way", "Aligned", "bg-brand"], ["More than 0.5 to 1.5", "Some gap", "bg-some-gap"], ["More than 1.5", "Big gap", "bg-big-gap"], ["In practice beats On paper by more than 0.5", "Better in practice", "bg-brand"], ["No public policy found", "No public policy", "bg-no-policy"]].map(([range, word, dot]) => (
              <li key={word} className="flex items-center justify-between gap-4 py-2.5">
                <span>{range}</span>
                <span className="flex items-center gap-2 font-medium text-text"><span className={`size-2.5 rounded-full ${dot}`} aria-hidden />{word}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="review-clock" title="The review clock">
          <p>
            BC law says a school &ldquo;must review its sexual misconduct policy (a) at least once every 3 years&rdquo; (<a href={sources.review_law.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current">Sexual Violence and Misconduct Policy Act, s. 3 (1)</a>), and must consult students when it does (s. 4).
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
          <p>Your rating is stored with no link to your account, dates are rounded to the week, and a school&apos;s results appear only after 5 ratings. You get a private code to change or withdraw your rating; we keep only a scrambled copy of it. There are no free-text boxes in the questionnaire, so no names or stories can be stored. <Link href="/privacy" className="text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current">Read the privacy policy</Link>.</p>
        </Section>

        <Section id="limits" title="Limits">
          <p>AI can be wrong. The quote check stops it from inventing policy text, but it can still misjudge how strong a clause is. Every score shows its quote so you can judge for yourself.</p>
          <p>To measure this, Farnaz is hand-grading three schools and comparing her scores with the AI&apos;s. The agreement rate will be shown here once it&apos;s measured.</p>
          <p>In practice is mostly sample data for now, so the map colours each school by its On paper grade and only draws a gap ring once a school has 5 real ratings.</p>
        </Section>

        <Section id="sources" title="Sources">
          <p>Every number, quote and policy on Onus links to where it came from. <Link href="/sources" className="text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current">See all sources</Link>.</p>
        </Section>
      </article>
    </main>
  );
}
