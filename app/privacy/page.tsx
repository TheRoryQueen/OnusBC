import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Onus" };

// The privacy policy (PRD, Privacy policy and data protection: user-facing page text). The PRD's Contact line
// ("a project email address, listed on the page") is left out until a project email actually receives mail.

const PROCESSORS: [string, string][] = [
  ["Supabase", "Database and sign-in"],
  ["Resend", "Sending your sign-in code"],
  ["Vercel", "Hosting the website"],
  ["Google Gemini", "Reading policies and answering your questions"],
  ["ElevenLabs", "Turning speech into text and answers into speech"],
  ["CARTO", "Map tiles"],
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline py-10">
      <h2 className="text-[19px] font-semibold tracking-tight text-text">{title}</h2>
      <div className="mt-4 text-[16px] leading-relaxed text-text-secondary">{children}</div>
    </section>
  );
}
const List = ({ items }: { items: string[] }) => (
  <ul className="space-y-2.5">
    {items.map((t) => <li key={t} className="flex gap-3"><span aria-hidden className="mt-[0.7em] size-1 shrink-0 rounded-full bg-text-secondary" />{t}</li>)}
  </ul>
);

export default function Privacy() {
  return (
    <main className="flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <article className="mx-auto w-full max-w-2xl">
        <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[3.75rem]">Privacy</h1>
        <p className="mb-8 mt-4 text-[17px] leading-relaxed text-text-secondary">
          Onus collects the least it can, never links a rating to a person, and says so in plain words.
        </p>

        <Block title="What we collect">
          <List items={[
            "Your school email address, to confirm you're connected to that school as a student, staff member, or alum. It is stored by our sign-in provider and never shown to anyone.",
            "A random username we assign you, and which school you belong to.",
            "Which schools you have rated, so you can't rate the same school twice. Not your answers.",
            "Your rating answers, stored with no link to your account.",
            "Questions you type or speak to the Ask assistant, processed to answer you.",
          ]} />
        </Block>

        <Block title="What we never collect">
          <List items={[
            "Your name, student number, or phone number",
            "Written comments or stories about what happened to you",
            "Recordings of your voice (audio is converted to text and discarded right away)",
            "Advertising trackers or cross-site analytics",
          ]} />
        </Block>

        <Block title="How your rating stays anonymous">
          <List items={[
            "Ratings are saved without your account ID, so nobody at Onus can see which ratings are yours.",
            "Dates are rounded to the week.",
            "A school's student results appear only after at least 5 people have rated it.",
            "You get a private one-time code to edit or withdraw your rating. We store only a scrambled version of it; if you lose it, we can't recover it.",
          ]} />
        </Block>

        <Block title="Who processes data for us">
          <ul className="divide-y divide-hairline border-y border-hairline">
            {PROCESSORS.map(([who, what]) => (
              <li key={who} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span className="text-[15px] font-medium text-text">{who}</span>
                <span className="text-[15px]">{what}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Please don't share personal details in the Ask assistant">
          <p>Questions are sent to an AI service to generate the answer. Ask about policy, not about a specific person or incident.</p>
        </Block>

        <Block title="Your choices">
          <p>
            You can withdraw a rating with your code, and delete your account from <Link href="/account" prefetch={false} className="text-brand underline-offset-2 hover:underline">My account</Link> at any time. Deleting your account removes your email and username; anonymous ratings remain because they can&apos;t be traced to you.
          </p>
        </Block>
      </article>
    </main>
  );
}
