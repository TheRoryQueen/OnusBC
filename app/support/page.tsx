import type { Metadata } from "next";
import sources from "@/data/sources.json";
import { SupportList, type Office } from "@/components/support-list";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Get support · Onus" };

// Get support (PRD): purple accent, calm, no images. Only sourced numbers: 911 and VictimLinkBC from
// data/sources.json, each school's office from the institutions table.
export default async function SupportPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("institutions")
    .select("slug, name, city, contact_office, contact_phone, contact_email, support_url, website")
    .eq("sector", "public").not("slug", "like", "zz-%").order("name");
  const offices: Office[] = (data ?? []).map((i) => ({
    slug: i.slug, name: i.name, city: i.city, office: i.contact_office, phone: i.contact_phone, email: i.contact_email, url: i.support_url ?? i.website,
  }));
  const victimLink = sources.crisis_lines.find((c) => c.name.startsWith("VictimLinkBC"))! as { phone: string; about: string; about_source: string };

  return (
    <main className="flex-1 px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-serif text-[2.75rem] leading-[1.05] text-text sm:text-[3.5rem]">
          {/* The number is set in the sans: Instrument Serif's 1 reads as an l, and 911 must be unmistakable. */}
          In danger right now?{" "}
          <a href="tel:911" className="whitespace-nowrap font-sans font-semibold tracking-tight text-support underline-offset-8 underline decoration-current/35 hover:decoration-current">Call 911.</a>
        </h1>

        <section aria-labelledby="victimlink" className="mt-12 border-t border-hairline pt-8">
          <h2 id="victimlink" className="text-[19px] font-semibold tracking-tight text-text">VictimLinkBC</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">
            Open 24/7. &ldquo;{victimLink.about}.&rdquo; <a href={victimLink.about_source} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">Province of BC</a>
          </p>
          <a href={`tel:${victimLink.phone.replace(/[^\d]/g, "")}`} className="mt-4 inline-flex min-h-12 items-center rounded-full bg-support px-6 text-[17px] font-medium tabular-nums text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-support dark:text-page">
            Call {victimLink.phone}
          </a>
          <p className="mt-8 font-serif text-[1.75rem] leading-snug text-text">You don&apos;t have to report to get support.</p>
        </section>

        <section aria-labelledby="school-support" className="mt-12 border-t border-hairline pt-8">
          <h2 id="school-support" className="text-[19px] font-semibold tracking-tight text-text">Support at your school</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">
            Each school&apos;s sexual violence support office, as the school publishes it. The Province keeps its own <a href={sources.province_lists.support} target="_blank" rel="noopener noreferrer" className="text-support underline-offset-2 underline decoration-current/35 hover:decoration-current">list of campus support</a>.
          </p>
          <div className="mt-6">
            <SupportList offices={offices} />
          </div>
        </section>
      </div>
    </main>
  );
}
