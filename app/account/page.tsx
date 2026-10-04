import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccountTabs } from "@/components/account-tabs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My account · Onus" };

// "f•••@capilanou.ca": the first letter and the domain, enough to recognise without showing it.
const mask = (email: string) => { const [user, domain] = email.split("@"); return `${user.slice(0, 1)}${"•".repeat(3)}@${domain}`; };

export default async function Account() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent("/account")}`);
  const domain = (user.email ?? "").split("@")[1]?.toLowerCase() ?? "";
  const [{ data: profile }, { count: ratedCount }, { data: insts }] = await Promise.all([
    supabase.from("profiles").select("role, is_judge, institutions(slug, name)").eq("id", user.id).maybeSingle(),
    supabase.from("has_rated").select("institution_id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("institutions").select("slug, name, email_domains, employee_domains, alumni_domains").eq("sector", "public"),
  ]);
  const school = (Array.isArray(profile?.institutions) ? profile?.institutions[0] : profile?.institutions) as { slug: string; name: string } | null | undefined;
  // The schools and role this email allows (the same rules as sign-up and update_profile in the database).
  type I = { slug: string; name: string; email_domains: string[] | null; employee_domains: string[] | null; alumni_domains: string[] | null };
  const has = (list: string[] | null) => (list ?? []).includes(domain);
  const matches = ((insts ?? []) as I[]).filter((i) => has(i.email_domains) || has(i.employee_domains) || has(i.alumni_domains));
  const fixed = matches.length > 0 && (
    matches.every((i) => has(i.email_domains) && !has(i.employee_domains)) ||
    matches.every((i) => has(i.employee_domains) && !has(i.email_domains)) ||
    matches.every((i) => has(i.alumni_domains) && !has(i.email_domains) && !has(i.employee_domains)));

  return (
    <main className="flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[3.75rem]">My account</h1>
        <Suspense>
          <AccountTabs
            email={user.email ? mask(user.email) : ""} isJudge={!!profile?.is_judge}
            school={school ?? null} schoolOptions={matches.map((i) => ({ slug: i.slug, name: i.name })).sort((a, b) => a.name.localeCompare(b.name))}
            schoolLocked={(ratedCount ?? 0) > 0} role={profile?.role ?? null} roleFixed={fixed} />
        </Suspense>
      </div>
    </main>
  );
}
