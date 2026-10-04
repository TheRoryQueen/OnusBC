import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SchoolPanel } from "@/components/panel/school-panel";
import { getInstitution } from "@/lib/data/institutions";
import { campusById } from "@/lib/campuses";

// /map shows the map alone; /map/<slug> opens that school's panel (deep links and the back button work);
// /map/<slug>/<campus> opens the same panel for one of its other campuses (data/campuses.json).
export async function generateMetadata(props: PageProps<"/map/[[...slug]]">): Promise<Metadata> {
  const { slug } = await props.params;
  if (!slug?.length) return {};
  const campus = slug.length === 2 ? campusById(slug[0], slug[1]) : null;
  const school = slug.length === 1 || campus ? await getInstitution(slug[0]).catch(() => null) : null;
  return school ? { title: `${school.name}${campus ? `, ${campus.name}` : ""} · Onus` } : {};
}

export default async function MapPage(props: PageProps<"/map/[[...slug]]">) {
  const { slug } = await props.params;
  if (!slug?.length) return null;
  const campus = slug.length === 2 ? campusById(slug[0], slug[1]) : null;
  if (slug.length > 2 || (slug.length === 2 && !campus)) notFound();
  let school;
  try {
    school = await getInstitution(slug[0]);
  } catch {
    return (
      <p className="glass absolute bottom-4 left-4 z-20 rounded-2xl px-4 py-3 text-sm text-text">
        Couldn&apos;t load this school. <Link href={`/map/${slug[0]}`} className="text-brand">Try again</Link>
      </p>
    );
  }
  if (!school) notFound();
  return <SchoolPanel key={school.slug} school={school} campus={campus} />;
}
