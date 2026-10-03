import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// "Rate your school" from the homepage: a signed-in person goes straight to their own school's form; a judge
// (no school of their own) picks one on the map; anyone else signs in first and comes back here.
export default async function RateIndex() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent("/rate")}`);
  const { data: profile } = await supabase.from("profiles").select("institutions(slug)").eq("id", user.id).maybeSingle();
  const inst = (Array.isArray(profile?.institutions) ? profile?.institutions[0] : profile?.institutions) as { slug: string } | null | undefined;
  redirect(inst?.slug ? `/rate/${inst.slug}` : "/map");
}
