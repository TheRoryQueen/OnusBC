import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RatingForm } from "@/components/rate/rating-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rate your school · Onus" };

export default async function RatePage(props: PageProps<"/rate/[slug]">) {
  const { slug } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/rate/${slug}`)}`);

  const { data: school } = await supabase.from("institutions").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!school) notFound();
  const { data: profile } = await supabase.from("profiles").select("institution_id, role, is_judge, institutions(slug, name)").eq("id", user.id).maybeSingle();
  const { data: rated } = await supabase.from("has_rated").select("institution_id").eq("institution_id", school.id).maybeSingle();

  const own = (Array.isArray(profile?.institutions) ? profile?.institutions[0] : profile?.institutions) as { slug: string; name: string } | null | undefined;
  const mismatch = !!profile && !profile.is_judge && profile.institution_id !== school.id;

  return (
    <main className="flex-1 px-4 pb-20 pt-6 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <p className="rounded-2xl bg-hairline/40 px-4 py-3 text-sm leading-relaxed text-text">
          These questions are about how your school handles reports, not about what happened to you. Skip anything you want.{" "}
          <Link href="/support" className="font-medium text-support underline-offset-2 hover:underline">Get help</Link>
        </p>
        <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-tight text-text">Rate {school.name}</h1>
        {mismatch ? (
          <div className="mt-6 space-y-3 text-[15px] text-text">
            <p>Your school email is from {own?.name ?? "a different school"}, so you can rate {own?.name ?? "that school"} on Onus.</p>
            {own && <Link href={`/rate/${own.slug}`} className="inline-block rounded-full bg-brand px-5 py-3 font-medium text-on-brand hover:bg-brand-hover">Rate {own.name}</Link>}
          </div>
        ) : !profile?.is_judge && (!profile?.role || !profile?.institution_id) ? (
          <p className="mt-6 text-[15px] text-text">Finish signing in first: <Link href={`/signin?next=/rate/${slug}`} className="text-brand">choose your role or campus</Link>.</p>
        ) : (
          <RatingForm slug={school.slug} schoolName={school.name} alreadyRated={!!rated} />
        )}
      </div>
    </main>
  );
}
