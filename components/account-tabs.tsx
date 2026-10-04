"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CodeBox } from "@/components/code-box";
import { ConfirmDialog } from "@/components/account/confirm-dialog";
import { deviceRatingsServerSnapshot, deviceRatingsSnapshot, parseDeviceRatings, removeDeviceRating, subscribeDeviceRatings } from "@/lib/device-ratings";
import { cn } from "@/lib/utils";

// My account: Profile, Privacy and Reviews. A left column of sections on wide screens (a row on phones);
// choosing one opens it on the right. ?tab=reviews opens Reviews (the rating form links there).
const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "privacy", label: "Privacy" },
  { id: "reviews", label: "Reviews" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const ROLES = ["student", "staff", "alumni"] as const;

export type AccountProps = {
  email: string; isJudge: boolean;
  school: { slug: string; name: string } | null;
  /** Schools this email can belong to (more than one only for shared domains, like UBC's two campuses). */
  schoolOptions: { slug: string; name: string }[];
  /** No school change once any school has been rated from this account. */
  schoolLocked: boolean;
  role: string | null;
  /** The email's domain sets the role (a student domain, an employee domain). */
  roleFixed: boolean;
};

const link = "text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current";
const quiet = "inline-flex min-h-11 items-center justify-center rounded-full bg-hairline/60 px-5 text-[15px] font-medium text-text transition-colors hover:bg-hairline focus-visible:outline-2 focus-visible:outline-brand";
const danger = "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-[15px] font-medium text-big-gap ring-1 ring-inset ring-big-gap/35 transition-colors hover:bg-big-gap/10 focus-visible:outline-2 focus-visible:outline-big-gap";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: url.includes("ratings") ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work just now. Try again in a moment.";
}

function Row({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="py-4">
      <dt className="text-[13px] text-text-secondary">{label}</dt>
      <dd className="mt-1 text-[16px] text-text">
        {children}
        {note && <span className="mt-1 block text-[13px] text-text-secondary">{note}</span>}
      </dd>
    </div>
  );
}

function Profile(p: AccountProps) {
  const router = useRouter();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (body: { role?: string; slug?: string }, done: string) => {
    setStatus(null);
    const e = await post("/api/account/profile", body);
    setStatus(e ? { ok: false, text: e } : { ok: true, text: done });
    if (!e) router.refresh();
  };
  const canChangeSchool = !p.isJudge && p.schoolOptions.length > 1 && !p.schoolLocked;
  const canChangeRole = !p.isJudge && !p.roleFixed;
  return (
    <>
      <dl className="divide-y divide-hairline border-y border-hairline">
        <Row label="School" note={p.isJudge ? undefined : canChangeSchool ? "Your school email works for these schools." : p.schoolLocked && p.schoolOptions.length > 1 ? "Your school can't change after you've rated." : "Set by your school email."}>
          {p.isJudge ? "Judge access (any school)" : canChangeSchool ? (
            <select aria-label="School" value={p.school?.slug ?? ""} onChange={(e) => save({ slug: e.target.value }, "School saved.")}
              className="mt-1 min-h-11 w-full max-w-sm rounded-full bg-surface px-4 text-[16px] text-text ring-1 ring-inset ring-hairline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {!p.school && <option value="" disabled>Choose your school</option>}
              {p.schoolOptions.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          ) : p.school?.name ?? "Not set"}
        </Row>
        <Row label="Role" note={p.isJudge ? undefined : canChangeRole ? "Your school uses one email for students and staff, so you choose." : "Set by your school email."}>
          {p.isJudge ? "Judge" : canChangeRole ? (
            <div role="radiogroup" aria-label="Role" className="mt-1 inline-flex rounded-full bg-hairline/50 p-1">
              {ROLES.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={p.role === r} onClick={() => p.role !== r && save({ role: r }, "Role saved.")}
                  className={cn("min-h-11 rounded-full px-4 text-[14px] capitalize transition-colors focus-visible:outline-2 focus-visible:outline-brand",
                    p.role === r ? "bg-surface font-medium text-text shadow-sm" : "text-text-secondary hover:text-text")}>
                  {r}
                </button>
              ))}
            </div>
          ) : <span className="capitalize">{p.role ?? "Not set"}</span>}
        </Row>
        <Row label="Email" note="Never shown to anyone.">{p.email}</Row>
      </dl>
      <p role="status" className={cn("mt-3 min-h-5 text-[14px]", status?.ok ? "text-text-secondary" : "text-big-gap")}>{status?.text}</p>
      {p.isJudge && (
        <p className="mt-4 text-[15px] text-text-secondary">As a judge, you can watch Onus grade a policy from outside BC live. <Link href="/grade" className={link}>Grade a policy</Link></p>
      )}
    </>
  );
}

function Privacy() {
  const router = useRouter();
  const signOut = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  };
  return (
    <div className="text-[16px] leading-relaxed text-text-secondary">
      <p className="text-text">Onus keeps as little as it can about you.</p>
      <ul className="mt-4 space-y-2.5">
        <li><span className="text-text">Your school email</span>, to sign you in. It is never shown to anyone.</li>
        <li><span className="text-text">Your school and role</span>, so you can rate your own school.</li>
        <li><span className="text-text">Which schools you&apos;ve rated</span>, so nobody rates the same school twice. Not your answers.</li>
        <li><span className="text-text">A random username</span> assigned at sign-up. It isn&apos;t shown anywhere.</li>
      </ul>
      <p className="mt-4">Your answers are stored with no link to your account, so nobody at Onus can tell which ratings are yours. The private code that deletes a rating is kept only on the device you rated from. <Link href="/privacy" className={link}>Read the privacy policy</Link></p>
      <div className="mt-8 flex flex-wrap gap-3 border-t border-hairline pt-6">
        <button type="button" onClick={signOut} className={quiet}>Sign out</button>
        <ConfirmDialog
          trigger="Delete account" triggerClassName={danger}
          title="Are you sure?"
          body="Deleting your account removes your email, school, role and username. Your ratings stay and keep counting, because they can't be traced to you; delete them in Reviews first if you want them gone. This can't be undone."
          confirmLabel="Delete my account" busyLabel="Deleting"
          onConfirm={async () => {
            const e = await post("/api/account/delete", { confirm: "delete" });
            if (!e) { router.push("/?account=deleted"); router.refresh(); }
            return e;
          }}
        />
      </div>
    </div>
  );
}

function Reviews() {
  // The list lives only in this browser (nothing on the server render).
  const raw = useSyncExternalStore(subscribeDeviceRatings, deviceRatingsSnapshot, deviceRatingsServerSnapshot);
  const list = useMemo(() => (raw === null ? null : parseDeviceRatings(raw)), [raw]);
  const [backup, setBackup] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [otherDone, setOtherDone] = useState(false);
  const withdraw = async (code: string) => {
    const e = await post("/api/ratings", { code, withdraw: true });
    if (!e) removeDeviceRating(code);
    return e;
  };
  if (!list) return <p className="text-[15px] text-text-secondary">Loading ratings on this device.</p>;
  return (
    <div>
      {list.length === 0 ? (
        <div className="space-y-3 text-[16px] leading-relaxed text-text-secondary">
          <p className="text-text">No ratings from this device.</p>
          <p>By design, Onus can&apos;t trace a rating back to an account, so it can&apos;t list ratings made somewhere else. A rating can only be found again with the private code kept on the device it was made on, or a backup code saved from there.</p>
          <p><Link href="/rate" className={link}>Rate your school</Link></p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {list.map((r) => (
            <li key={r.code} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[16px] text-text">{r.school}</p>
                  <p className="text-[13px] text-text-secondary">Rated on this device{r.saved ? `, ${new Date(`${r.saved}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setBackup(backup === r.code ? null : r.code)} aria-expanded={backup === r.code}
                    className="inline-flex min-h-11 items-center rounded-full px-3 text-[14px] text-text-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-brand">
                    {backup === r.code ? "Hide backup code" : "Save a backup code"}
                  </button>
                  <ConfirmDialog
                    trigger="Delete" triggerClassName={danger}
                    title="Are you sure?"
                    body={`Your rating of ${r.school} will stop counting. This can't be undone, and this account can't rate ${r.school} again.`}
                    confirmLabel="Delete rating" busyLabel="Deleting"
                    onConfirm={() => withdraw(r.code)}
                  />
                </div>
              </div>
              {backup === r.code && (
                <div className="mt-3 max-w-sm space-y-2">
                  <CodeBox code={r.code} size="sm" />
                  <p className="text-[13px] text-text-secondary">With this code you can delete the rating from another device. Anyone who has it can too.</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-8 text-[15px] text-text-secondary">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-text">Rated on another device? Use a backup code</summary>
        {otherDone ? (
          <p role="status" className="mt-2 text-text">That rating is deleted. It no longer counts.</p>
        ) : (
          <div className="mt-2 max-w-sm space-y-3">
            <label htmlFor="backup-code" className="block text-[14px] text-text">Backup code</label>
            <input id="backup-code" value={other} onChange={(e) => setOther(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              autoComplete="off" spellCheck={false} inputMode="text" placeholder="8 letters and numbers"
              className="min-h-12 w-full rounded-full bg-surface px-5 font-mono text-lg tracking-[0.18em] text-text ring-1 ring-inset ring-hairline placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-brand" />
            {other.length === 8 ? (
              <ConfirmDialog
                trigger="Delete that rating" triggerClassName={danger}
                title="Are you sure?"
                body="The rating with this code will stop counting. This can't be undone."
                confirmLabel="Delete rating" busyLabel="Deleting"
                onConfirm={async () => { const e = await withdraw(other); if (!e) setOtherDone(true); return e; }}
              />
            ) : (
              <button type="button" disabled className={cn(danger, "opacity-40")}>Delete that rating</button>
            )}
          </div>
        )}
      </details>
    </div>
  );
}

export function AccountTabs(props: AccountProps) {
  const params = useSearchParams();
  const initial = SECTIONS.find((s) => s.id === params.get("tab"))?.id ?? "profile";
  const [section, setSection] = useState<SectionId>(initial);
  return (
    <div className="mt-8 grid gap-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12">
      <div role="tablist" aria-label="My account" aria-orientation="vertical"
        onKeyDown={(e) => {
          const i = SECTIONS.findIndex((s) => s.id === section);
          const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = SECTIONS[(i + step + SECTIONS.length) % SECTIONS.length].id;
          setSection(next);
          document.getElementById(`tab-${next}`)?.focus();
        }}
        className="flex gap-1 md:sticky md:top-24 md:flex-col md:self-start">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" id={`tab-${s.id}`} aria-selected={section === s.id} aria-controls={`panel-${s.id}`}
            tabIndex={section === s.id ? 0 : -1} onClick={() => setSection(s.id)}
            className={cn("min-h-11 rounded-full px-4 text-left text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-brand",
              section === s.id ? "bg-hairline/70 font-medium text-text" : "text-text-secondary hover:text-text")}>
            {s.label}
          </button>
        ))}
      </div>
      <section role="tabpanel" id={`panel-${section}`} aria-labelledby={`tab-${section}`} className="min-w-0">
        <h2 className="text-[22px] font-semibold tracking-tight text-text">{SECTIONS.find((s) => s.id === section)!.label}</h2>
        <div className="mt-5">
          {section === "profile" && <Profile {...props} />}
          {section === "privacy" && <Privacy />}
          {section === "reviews" && <Reviews />}
        </div>
      </section>
    </div>
  );
}
