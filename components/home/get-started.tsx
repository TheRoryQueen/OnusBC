"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "./in-view";

// Homepage, fourth screen (PRD; docs/components.md section 4): a sticky heading with the buttons on the
// left, five numbered steps on the right joined by a hairline. Steps fade up once as they scroll in.

const STEPS: { title: string; body: string }[] = [
  { title: "Find your school.", body: "Every public college and university in BC is on the map, coloured green to red by its On paper grade, with a ring where students' experience differs from the policy." },
  { title: "Read the policy, graded.", body: "Seventeen criteria, each backed by a quote from the school’s own policy. If the quote isn’t in the policy, the point doesn’t count." },
  { title: "Ask it anything.", body: "Type or talk. Answers come only from that school’s policy, with the section cited." },
  { title: "Rate your school.", body: "Sign in with your school email. Your answers are stored with no link to you." },
  { title: "Get help, anytime.", body: "Support lines and your school’s office are one tap away on every page. You don’t have to report to get support." },
];

export function GetStarted() {
  const reduce = usePrefersReducedMotion();
  return (
    <section aria-labelledby="start-heading" className="border-t border-hairline">
      <div className="mx-auto grid w-full max-w-6xl gap-x-20 gap-y-14 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 id="start-heading" className="max-w-[12ch] font-serif text-[2.75rem] leading-[1.02] text-text sm:text-[3.5rem]">
            How safe is your school, really?
          </h2>
          <p className="mt-5 max-w-[36ch] text-[17px] leading-relaxed text-text-secondary">
            Find your school. See what its policy promises next to what students say happens. Ask it anything.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/map" className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-[15px] font-medium text-on-brand transition-colors hover:bg-brand-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Explore the map
            </Link>
            <Link href="/rate" prefetch={false} className="inline-flex min-h-12 items-center rounded-full bg-surface px-6 text-[15px] font-medium text-text ring-1 ring-inset ring-hairline transition-shadow hover:ring-text-secondary/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Rate your school
            </Link>
            <Link href="/support" prefetch={false} className="inline-flex min-h-12 items-center px-3 text-[15px] font-medium text-support underline-offset-4 hover:underline">
              Get help
            </Link>
          </div>
        </div>

        <ol className="relative">
          {/* The thread between the step circles. */}
          <span aria-hidden className="absolute bottom-6 left-5 top-6 w-px bg-hairline" />
          {STEPS.map((s, i) => (
            <motion.li key={s.title} className="relative grid grid-cols-[2.5rem_1fr] gap-x-5 pb-12 last:pb-0"
              initial={{ opacity: 0, y: 16 }}
              {...(reduce ? { animate: { opacity: 1, y: 0 }, transition: { duration: 0 } } : {
                whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.6 }, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
              })}>
              <span aria-hidden className="relative grid size-10 place-items-center rounded-full bg-brand-tint text-[15px] font-semibold tabular-nums text-brand ring-4 ring-page">
                {i + 1}
              </span>
              <div className="pt-1.5">
                <h3 className="text-[19px] font-semibold tracking-tight text-text">{s.title}</h3>
                <p className="mt-1.5 max-w-[46ch] text-[16px] leading-relaxed text-text-secondary">{s.body}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
