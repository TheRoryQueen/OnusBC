import type { Metadata } from "next";
import sources from "@/data/sources.json";
import { SupportList, type Office } from "@/components/support-list";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Get support · Onus" };

// Get support (PRD): purple accent, calm, no images. Laid out like the homepage: a 6xl frame, sections split
// by full-width hairlines, a serif title on the left and the content on the right (stacked on phones).
// Only sourced numbers: 911 and VictimLinkBC from data/sources.json, each school's office from the
// institutions table.
export default async function SupportPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("institutions")
    .select("slug, name, city, contact_office, contact_phone, contact_email, support_url, website")
    .eq("sector", "public").not("slug", "like", "zz-%").order("name");
  const offices: Office[] = (data ?? []).map((i) => ({
    slug: i.slug, name: i.name, city: i.city, office: i.contact_office, phone: i.contact_phone, email: i.contact_email, url: i.support_url ?? i.website,
  }));
  const victimLink = sources.crisis_lines.find((c) => c.name.startsWith("VictimLinkBC"))! as { phone: string; about: string; about_source: string };
  const frame = "mx-auto grid w-full max-w-6xl gap-x-16 gap-y-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]";

  return (
    <main className="flex-1 pb-8">
      <section className={`${frame} pb-16 pt-14 sm:pt-20`}>
        <h1 className="font-serif text-[2.75rem] leading-[1.02] text-text sm:text-[4rem] lg:col-span-2">
          {/* The number is set in the sans: Instrument Serif's 1 reads as an l, and 911 must be unmistakable. */}
          In danger right now?{" "}
          <a href="tel:911" className="whitespace-nowrap font-sans font-semibold tracking-tight text-support underline-offset-8 underline decoration-current/35 hover:decoration-current">Call 911.</a>
        </h1>
      </section>

      <section aria-labelledby="victimlink" className="border-t border-hairline">
        <div className={`${frame} py-14 sm:py-16`}>
          <p className="max-w-[14ch] font-serif text-[2.25rem] leading-[1.05] text-text sm:text-[2.75rem]">You don&apos;t have to report to get support.</p>
          <div>
            <h2 id="victimlink" className="text-[15px] font-medium text-text-secondary">VictimLinkBC, open 24/7</h2>
            <a href={`tel:${victimLink.phone.replace(/[^\d]/g, "")}`} aria-label={`Call VictimLinkBC, ${victimLink.phone}`}
              className="mt-2 inline-flex min-h-11 items-center text-[2.5rem] font-semibold leading-none tracking-tight tabular-nums text-support underline-offset-8 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-support sm:text-[3.5rem]">
              {victimLink.phone}
            </a>
            <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-text-secondary">
              &ldquo;{victimLink.about}.&rdquo; <a href={victimLink.about_source} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">Province of BC</a>
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="school-support" className="border-t border-hairline">
        <div className={`${frame} py-14 sm:py-16`}>
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 id="school-support" className="max-w-[12ch] font-serif text-[2.25rem] leading-[1.05] text-text sm:text-[2.75rem]">Support at your school</h2>
            <p className="mt-4 max-w-[38ch] text-[16px] leading-relaxed text-text-secondary">
              Each school&apos;s sexual violence support office, as the school publishes it. The Province keeps its own <a href={sources.province_lists.support} target="_blank" rel="noopener noreferrer" className="text-support underline-offset-2 underline decoration-current/35 hover:decoration-current">list of campus support</a>.
            </p>
          </div>
          <SupportList offices={offices} />
        </div>
      </section>
    </main>
  );
}
