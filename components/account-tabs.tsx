"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// My account (PRD): Profile, Privacy and Reviews tabs; Sign out at the bottom.
type Props = { username: string; school: string | null; role: string | null; maskedEmail: string; isJudge: boolean; rated: { slug: string; name: string }[] };
const TABS = ["Profile", "Privacy", "Reviews"] as const;

export function AccountTabs({ username, school, role, maskedEmail, isJudge, rated }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Profile");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  };
  const deleteAccount = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "delete" }) });
    if (!res.ok) { setBusy(false); setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Your account couldn't be deleted just now. Try again in a moment."); return; }
    router.push("/?account=deleted");
    router.refresh();
  };

  const row = "flex flex-col gap-0.5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6";
  return (
    <div className="mt-8">
      <div role="tablist" aria-label="My account" className="inline-flex rounded-full bg-hairline/50 p-1">
        {TABS.map((t) => (
          <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => setTab(t)}
            className={cn("min-h-10 rounded-full px-4 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-brand",
              tab === t ? "bg-surface font-medium text-text shadow-sm" : "text-text-secondary hover:text-text")}>
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-8">
        {tab === "Profile" && (
          <dl className="divide-y divide-hairline border-y border-hairline text-[15px]">
            <div className={row}><dt className="text-text-secondary">Username</dt><dd className="font-medium text-text">{username}</dd></div>
            <div className={row}><dt className="text-text-secondary">School</dt><dd className="text-text">{isJudge ? "Judge access (any school)" : school ?? "Not set"}</dd></div>
            <div className={row}><dt className="text-text-secondary">Role</dt><dd className="capitalize text-text">{isJudge ? "Judge" : role ?? "Not set"}</dd></div>
            <div className={row}><dt className="text-text-secondary">Email</dt><dd className="text-text">{maskedEmail}</dd></div>
          </dl>
        )}

        {tab === "Privacy" && (
          <div className="space-y-5 text-[16px] leading-relaxed text-text-secondary">
            <p>Your ratings are stored with no link to your account, so nobody at Onus can see which ratings are yours. Onus keeps your email (to sign you in), a random username, your school, and which schools you&apos;ve rated, not your answers. <Link href="/privacy" className="text-brand underline-offset-2 hover:underline">Read the privacy policy</Link>.</p>
            <div className="border-t border-hairline pt-6">
              <h2 className="text-[17px] font-semibold text-text">Delete account</h2>
              <p className="mt-1">This removes your email and username. Your ratings stay, because they can&apos;t be traced to you; use your code first if you want to withdraw one. This can&apos;t be undone.</p>
              {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-surface px-5 text-[15px] font-medium text-big-gap ring-1 ring-inset ring-hairline hover:ring-big-gap/50">
                  Delete my account
                </button>
              ) : (
                <div role="alertdialog" aria-labelledby="confirm-delete" className="mt-4 rounded-[20px] bg-hairline/40 p-5">
                  <p id="confirm-delete" className="text-[15px] font-medium text-text">Delete your account for good?</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" disabled={busy} onClick={deleteAccount} className="inline-flex min-h-11 items-center rounded-full bg-big-gap px-5 text-[15px] font-medium text-white disabled:opacity-50 dark:text-page">
                      {busy ? "Deleting" : "Yes, delete it"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="inline-flex min-h-11 items-center rounded-full bg-surface px-5 text-[15px] font-medium text-text ring-1 ring-inset ring-hairline">
                      Keep my account
                    </button>
                  </div>
                  {error && <p role="alert" className="mt-3 text-sm text-big-gap">{error}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "Reviews" && (
          rated.length === 0 ? (
            <p className="text-[16px] text-text-secondary">You haven&apos;t rated a school yet. <Link href="/rate" className="text-brand underline-offset-2 hover:underline">Rate your school</Link>.</p>
          ) : (
            <ul className="divide-y divide-hairline border-y border-hairline">
              {rated.map((r) => (
                <li key={r.slug} className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <span className="text-[15px] text-text">You&apos;ve rated {r.name}</span>
                  <Link href={`/rate/${r.slug}`} className="text-[14px] font-medium text-brand underline-offset-2 hover:underline">Change or withdraw with your code</Link>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <div className="mt-10">
        <button type="button" onClick={signOut} className="inline-flex min-h-11 items-center rounded-full bg-surface px-5 text-[15px] font-medium text-text ring-1 ring-inset ring-hairline hover:ring-text-secondary/40">
          Sign out
        </button>
      </div>
    </div>
  );
}
