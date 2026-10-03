import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BCDottedMap } from "@/components/bc-dotted-map";
import { SignInCard } from "@/components/auth/signin-card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in · Onus" };

const safeNext = (next: string | undefined) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/map");

// One floating glass card over the faint BC dotted map (lower presence than the homepage hero).
export default async function SignInPage(props: PageProps<"/signin">) {
  const { next } = (await props.searchParams) as { next?: string };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(safeNext(next));
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <BCDottedMap landOpacity={0.1} />
      </div>
      <div className="relative z-10 flex w-full justify-center">
        <SignInCard next={next ?? null} />
      </div>
    </main>
  );
}
