import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GradedCopy } from "@/components/documents/graded-copy";
import { getInstitution } from "@/lib/data/institutions";
import { documentsFor } from "@/lib/documents";

// The graded copy of a school's policy (and procedures), full page: the same viewer as in the map, with the
// official source and the date it was retrieved. Never for a school whose policy is behind a login.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await getInstitution(slug).catch(() => null);
  return { title: s ? `${s.name}: graded policy · Onus` : "Graded policy · Onus" };
}

export default async function GradedCopyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ doc?: string }> }) {
  const { slug } = await params;
  const { doc } = await searchParams;
  const school = await getInstitution(slug).catch(() => null);
  if (!school || !school.policy_found || documentsFor(slug).length === 0) notFound();
  return (
    <main className="flex-1">
      <GradedCopy slug={slug} school={school.name} role={doc === "procedures" ? "procedures" : "policy"} />
    </main>
  );
}
