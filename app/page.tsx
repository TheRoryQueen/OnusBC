import quotes from "@/data/quotes.json";
import { GetStarted } from "@/components/home/get-started";
import { Hero } from "@/components/home/hero";
import { Numbers } from "@/components/home/numbers";
import { TheirWords, type Quote } from "@/components/home/their-words";

// The homepage (PRD, Homepage order): definition, then national numbers, then human voices, then your school.
// Only quotes marked approved in data/quotes.json ever render.
export default function Home() {
  const approved = (quotes.quotes as (Quote & { approved: boolean })[]).filter((q) => q.approved).slice(0, 3);
  // Shown first, third, second, so the sequence ends on the short line.
  if (approved.length === 3) approved.push(approved.splice(1, 1)[0]);
  return (
    <main className="flex-1">
      <Hero />
      <Numbers />
      {approved.length > 0 && <TheirWords quotes={approved} />}
      <GetStarted />
    </main>
  );
}
