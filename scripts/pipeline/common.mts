// Shared helpers for the grading pipeline (crawl, extract, grade, verify, embed).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { requireEnv } from "../lib/db.mts";

export const ROOT = new URL("../../", import.meta.url).pathname;
export const POLICIES = `${ROOT}data/policies/`;
export const EXTRACTED = `${ROOT}data/extracted/`;
export const GRADING = `${ROOT}data/grading/`;
export const MANIFEST = `${POLICIES}manifest.json`;

export type Institution = { slug: string; name: string; policy_url: string };
export const institutions: Institution[] = JSON.parse(readFileSync(`${ROOT}data/institutions.json`, "utf8")).institutions;

export type DocEntry = {
  role: "policy" | "procedures"; url: string; final_url?: string; status: number; kind?: "pdf" | "html";
  file?: string; bytes?: number; sha256?: string; manual?: boolean; error?: string;
};
export type ManifestEntry = {
  url: string; fetched_at: string; policy_found: boolean; documents: DocEntry[];
  sha256?: string; changed?: boolean; previous_sha256?: string; note?: string; error?: string;
};
export const readManifest = (): Record<string, ManifestEntry> => (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {});
export const writeJson = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetches with curl so the system certificate store is used; browser-like headers because several
// school sites refuse bare scripted requests.
export function download(url: string, out: string): { status: number; finalUrl: string; contentType: string } {
  const meta = execFileSync("curl", [
    "-sSL", "--max-time", "60", "-o", out, "-w", "%{http_code}\t%{url_effective}\t%{content_type}",
    "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
    "-H", "Accept: text/html,application/xhtml+xml,application/pdf,*/*;q=0.8", "-H", "Accept-Language: en-CA,en;q=0.9", url,
  ], { encoding: "utf8" });
  const [status, finalUrl, contentType] = meta.split("\t");
  return { status: Number(status), finalUrl, contentType };
}

// Gemini REST call with retry on rate limits. The key is sent as a header, never printed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Gemini REST responses are untyped JSON
export async function gemini(path: string, body: unknown, attempts = 6): Promise<any> {
  const key = requireEnv("GEMINI_API_KEY");
  for (let i = 0; i < attempts; i++) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body),
      });
    } catch (e) {
      // Dropped connection (ECONNRESET and similar): retry like a rate limit.
      if (i < attempts - 1) { console.log(`  network error (${(e as Error).message}), retrying in 15s`); await sleep(15_000); continue; }
      throw e;
    }
    if (res.ok) return res.json();
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && i < attempts - 1) {
      const wait = Math.min(90_000, 15_000 * 2 ** i);
      console.log(`  Gemini ${res.status}, retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
}

// The quote check uses the same normalization as the Ask agent.
export { normalize } from "../../lib/text.ts";
