import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "@/data/policies/manifest.json";

// The graded copies: the exact policy and procedures files Onus graded (data/policies), served inside Onus
// with their official source URL and retrieval date. Web-page policies are served as the stored, cleaned
// text that was graded (data/extracted). A school whose policy is behind a login (COTR) is never served.

type ManifestDoc = { role: "policy" | "procedures"; url: string; final_url?: string; kind?: "pdf" | "html"; file?: string };
type ManifestEntry = { fetched_at: string; policy_found: boolean; documents?: ManifestDoc[] };
const M = manifest as unknown as Record<string, ManifestEntry>;

export type DocMeta = { role: "policy" | "procedures"; label: "Policy" | "Procedures"; kind: "pdf" | "html"; official_url: string; retrieved: string };

export function documentsFor(slug: string): DocMeta[] {
  const e = M[slug];
  if (!e || !e.policy_found) return [];
  return (e.documents ?? []).filter((d) => d.file && d.kind).map((d) => ({
    role: d.role, label: d.role === "policy" ? "Policy" : "Procedures", kind: d.kind!,
    official_url: d.final_url ?? d.url, retrieved: e.fetched_at.slice(0, 10),
  }));
}

const ROOT = process.cwd();
export async function documentFile(slug: string, role: string): Promise<{ kind: "pdf"; body: Uint8Array } | { kind: "html"; sections: { section: string; title: string; text: string }[] } | null> {
  const e = M[slug];
  if (!e || !e.policy_found || !/^[a-z0-9-]+$/.test(slug)) return null;
  const d = (e.documents ?? []).find((x) => x.role === role && x.file);
  if (!d) return null;
  if (d.kind === "pdf") {
    const body = new Uint8Array(await readFile(path.join(ROOT, "data/policies", path.basename(d.file!))));
    if (new TextDecoder().decode(body.slice(0, 5)) !== "%PDF-") return null;
    return { kind: "pdf", body };
  }
  const ex = JSON.parse(await readFile(path.join(ROOT, "data/extracted", `${slug}.json`), "utf8")) as { sections: { document?: string; section: string; title: string; text: string }[] };
  const label = role === "policy" ? "Policy" : "Procedures";
  return { kind: "html", sections: ex.sections.filter((s) => (s.document ?? "Policy") === label).map(({ section, title, text }) => ({ section, title, text })) };
}
