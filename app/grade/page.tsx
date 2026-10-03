import type { Metadata } from "next";
import Link from "next/link";
import { GradeRunner } from "@/components/grade/grade-runner";
import { DAILY_RUN_CAP, LIVE_MODEL, SAMPLES, graderAccess, quotaCheck } from "@/lib/grading/live";

export const metadata: Metadata = { title: "Grade a policy · Onus", robots: { index: false } };
export const dynamic = "force-dynamic";

// Live grading for judges and admins: the same extraction, prompt and quote check as the BC policies,
// run on a policy from outside BC while you watch. Results are not added to the BC map.
export default async function GradePage() {
  const access = await graderAccess();
  if (!access.ok) {
    return (
      <main className="flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
        <article className="mx-auto w-full max-w-3xl">
          <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[3.75rem]">Grade a policy</h1>
          <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-text-secondary">
            This page is for StormHacks judges and Onus admins. {access.signedIn ? "Your account doesn't have access." : "Sign in with the judge code to use it."}
          </p>
          {!access.signedIn && (
            <Link href="/signin?next=/grade" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-text px-5 text-[15px] font-medium text-page">Sign in</Link>
          )}
        </article>
      </main>
    );
  }
  const quota = await quotaCheck();
  return (
    <main className="flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <article className="mx-auto w-full max-w-3xl">
        <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[3.75rem]">Grade a policy</h1>
        <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-text-secondary">
          Watch Onus grade a real sexual violence policy from outside BC, the same way it graded every BC school: 17 criteria, and every quote checked word for word against the document. Results are not added to the BC map.
        </p>
        <GradeRunner
          samples={SAMPLES.map(({ id, name, province, title, url }) => ({ id, name, province, title, url }))}
          runsLeft={Math.max(0, DAILY_RUN_CAP - quota.usedToday)} cap={DAILY_RUN_CAP} model={LIVE_MODEL}
        />
      </article>
    </main>
  );
}
