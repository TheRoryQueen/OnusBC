"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { createClient } from "@/lib/supabase/client";
import { trapTab } from "@/lib/trap-tab";
import { cn } from "@/lib/utils";

type School = { id: string; slug: string; name: string; email_domains: string[]; employee_domains: string[]; alumni_domains: string[] };
type Role = "student" | "staff" | "alumni";

const WRONG_DOMAIN = "Onus works with BC public college and university emails. Use your school address, like name@my.capilanou.ca.";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_S = 30;

const inputCls = "w-full rounded-full border border-hairline bg-surface px-4 py-3 text-[15px] text-text placeholder:text-text-secondary/80 focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
const primaryBtn = "w-full rounded-full bg-brand px-5 py-3 text-[15px] font-medium text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const quietLink = "text-sm text-text-secondary underline-offset-4 hover:text-text hover:underline";

const domainOf = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";
const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/map");

function Capsules<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm text-text">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex rounded-full bg-hairline/50 p-0.5">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={cn("flex-1 rounded-full px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand",
              value === o.value ? "bg-surface font-medium text-text shadow-sm" : "text-text-secondary hover:text-text")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CodeBoxes({ disabled, onComplete }: { disabled: boolean; onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  const set = (next: string[]) => {
    setDigits(next);
    if (next.every((d) => d)) onComplete(next.join(""));
  };
  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={1}
          className="h-14 w-full min-w-0 rounded-2xl border border-hairline bg-surface text-center text-2xl font-medium text-text tabular-nums focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-60"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) { const n = [...digits]; n[i] = ""; setDigits(n); return; }
            const n = [...digits]; n[i] = v.slice(-1); set(n);
            if (i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) { refs.current[i - 1]?.focus(); const n = [...digits]; n[i - 1] = ""; setDigits(n); }
          }}
          onPaste={(e) => {
            const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (p.length) { e.preventDefault(); const n = p.padEnd(6, " ").split("").map((c) => c.trim()); set(n); refs.current[Math.min(p.length, 5)]?.focus(); }
          }}
        />
      ))}
    </div>
  );
}

export function SignInCard({ next }: { next: string | null }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [campus, setCampus] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [codeKey, setCodeKey] = useState(0);
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [judgeCode, setJudgeCode] = useState("");
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Someone on a slow connection may type before the page finishes loading; keep what they typed.
  useEffect(() => {
    const typed = emailRef.current?.value;
    if (typed) setEmail(typed);
  }, []);

  useEffect(() => {
    supabase.from("institutions").select("id, slug, name, email_domains, employee_domains, alumni_domains").eq("sector", "public").order("name")
      .then(({ data }) => setSchools((data as School[]) ?? []));
  }, [supabase]);
  useEffect(() => {
    if (step !== "code") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Shared domains: the role can't be read from the address. UBC: the campus can't either.
  const domain = domainOf(email);
  const matches = schools.filter((s) => s.email_domains.includes(domain) || s.employee_domains.includes(domain) || s.alumni_domains.includes(domain));
  const sharedRole = matches.length > 0 && matches.every((s) => s.email_domains.includes(domain) && s.employee_domains.includes(domain));
  const needsCampus = matches.length > 1;

  const finish = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role, institution_id, is_judge").eq("id", user.id).single();
      if (profile && !profile.is_judge) {
        const p_role = !profile.role && role ? role : null;
        const p_institution_id = !profile.institution_id && campus ? campus : null;
        if (p_role || p_institution_id) await supabase.rpc("choose_profile", { p_role, p_institution_id });
      }
    }
    router.replace(safeNext(next));
    router.refresh();
  };

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter your full school email address."); return; }
    if (sharedRole && !role) { setError("Choose whether you're a student, staff member, or alum."); return; }
    if (needsCampus && !campus) { setError("Choose your campus."); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      if (/school address|domain/i.test(error.message)) setError(WRONG_DOMAIN);
      else if (error.status === 429) setError("Too many codes requested. Try again in a minute.");
      else setError("We couldn't send a code just now. Try again in a moment.");
      return;
    }
    setSentAt(Date.now()); setNow(Date.now()); setStep("code"); setCodeKey((k) => k + 1);
  };

  const verify = async (token: string) => {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: "email" });
    if (error) {
      setBusy(false);
      setError(Date.now() - sentAt > CODE_TTL_MS ? "That code expired. We can send a new one." : "That code didn't match. Check your latest email.");
      setCodeKey((k) => k + 1);
      return;
    }
    await finish();
  };

  // Judge access uses the email typed on the card; the dialog asks only for the event code.
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const openJudge = () => {
    if (!validEmail) { setError(null); setHint("Enter your email first, then choose Judge access."); emailRef.current?.focus(); return; }
    setError(null); setHint(null); setJudgeError(null); setJudgeOpen(true);
  };
  const judgeSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setJudgeError(null);
    setBusy(true);
    const res = await fetch("/api/judge-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), code: judgeCode }) });
    const body = (await res.json().catch(() => ({}))) as { token_hash?: string; error?: string };
    if (!res.ok || !body.token_hash) { setBusy(false); setJudgeError(body.error ?? "Judge access didn't work. Try again in a moment."); return; }
    const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: body.token_hash });
    if (error) { setBusy(false); setJudgeError("Judge access didn't work. Try again in a moment."); return; }
    await finish();
  };

  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));

  return (
    <div className="w-full max-w-sm">
      <div className="glass rounded-[28px] p-7">
        <p className="text-center text-lg font-semibold tracking-tight text-text">Onus</p>
        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-5 space-y-4" noValidate>
            <h1 className="text-center text-xl font-semibold text-text">Sign in with your school email</h1>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm text-text">School email</label>
              <input ref={emailRef} id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); setHint(null); }}
                placeholder="name@my.capilanou.ca" className={inputCls} aria-invalid={!!error} aria-describedby={error ? "signin-error" : undefined} />
            </div>
            {sharedRole && (
              <Capsules<Role> label="You are" value={role} onChange={setRole}
                options={[{ value: "student", label: "Student" }, { value: "staff", label: "Staff" }, { value: "alumni", label: "Alumni" }]} />
            )}
            {needsCampus && (
              <Capsules<string> label="Your campus" value={campus} onChange={setCampus}
                options={matches.map((m) => ({ value: m.id, label: m.name.replace(/^University of British Columbia, /, "") }))} />
            )}
            {error && <p id="signin-error" role="alert" className="text-sm text-big-gap">{error}</p>}
            {hint && !error && <p role="status" className="text-sm text-text">{hint}</p>}
            <div className="border-t border-hairline pt-4">
              <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Sending" : "Send code"}</button>
              <p className="mt-3 text-center text-xs leading-relaxed text-text-secondary">
                We never show your email. Your ratings aren&apos;t linked to your account. <Link href="/privacy" prefetch={false} className="text-brand underline-offset-2 hover:underline">Privacy</Link>
              </p>
            </div>
          </form>
        ) : (
          <div className="mt-5 space-y-4">
            <h1 className="text-center text-xl font-semibold text-text">Check your email</h1>
            <p className="text-center text-sm text-text-secondary">We sent a 6-digit code to <span className="text-text">{email.trim().toLowerCase()}</span>. It expires in 10 minutes.</p>
            <CodeBoxes key={codeKey} disabled={busy} onComplete={verify} />
            {error && <p role="alert" className="text-center text-sm text-big-gap">{error}</p>}
            <div className="flex items-center justify-between border-t border-hairline pt-4">
              <button type="button" className={quietLink} onClick={() => { setStep("email"); setError(null); }}>Use a different email</button>
              <button type="button" className={cn(quietLink, "disabled:no-underline disabled:opacity-60")} disabled={wait > 0 || busy} onClick={() => sendCode()}>
                {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
              </button>
            </div>
          </div>
        )}
      </div>

      {step === "email" && (
        <div className="mt-4 text-center">
          <button type="button" className={quietLink} onClick={openJudge}>Judge access</button>
        </div>
      )}

      <Dialog.Root open={judgeOpen} onOpenChange={(o) => { setJudgeOpen(o); if (!o) setJudgeError(null); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-page/70 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
          <Dialog.Popup onKeyDown={trapTab} className="fixed bg-raised shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35)] ring-1 ring-hairline left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-[28px] p-6 transition-[opacity,transform] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <Dialog.Title className="text-lg font-semibold text-text">Judge access</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-text-secondary">
              Signs in as <span className="break-all text-text">{email.trim().toLowerCase()}</span>
            </Dialog.Description>
            <form onSubmit={judgeSignIn} className="mt-5 space-y-4" noValidate>
              <div>
                <label htmlFor="judge-code" className="mb-2 block text-sm text-text">Event code</label>
                <input id="judge-code" type="text" autoComplete="off" autoFocus value={judgeCode} onChange={(e) => { setJudgeCode(e.target.value); setJudgeError(null); }}
                  className={inputCls} aria-invalid={!!judgeError} aria-describedby={judgeError ? "judge-error" : undefined} />
              </div>
              {judgeError && <p id="judge-error" role="alert" className="text-sm text-big-gap">{judgeError}</p>}
              <button type="submit" disabled={busy || !judgeCode} className={primaryBtn}>{busy ? "Checking" : "Continue as a judge"}</button>
              <Dialog.Close className={cn(quietLink, "block w-full text-center")}>Cancel</Dialog.Close>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
