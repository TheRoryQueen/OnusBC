import type { Metadata } from "next";
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
  const [{ data: profile }, { data: rated }] = await Promise.all([
    supabase.from("profiles").select("username, role, is_judge, institutions(name)").eq("id", user.id).maybeSingle(),
    supabase.from("has_rated").select("institutions(slug, name)").eq("user_id", user.id),
  ]);
  const inst = (Array.isArray(profile?.institutions) ? profile?.institutions[0] : profile?.institutions) as { name: string } | null | undefined;
  const ratedSchools = (rated ?? []).map((r) => (Array.isArray(r.institutions) ? r.institutions[0] : r.institutions) as { slug: string; name: string }).filter(Boolean);

  return (
    <main className="flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[3.75rem]">My account</h1>
        <AccountTabs username={profile?.username ?? ""} school={inst?.name ?? null} role={profile?.role ?? null}
          maskedEmail={user.email ? mask(user.email) : ""} isJudge={!!profile?.is_judge} rated={ratedSchools} />
      </div>
    </main>
  );
}
