import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import type { GradeEvent } from "@/lib/grading/events";
import { SAMPLES, UserFacingError, graderAccess, latestRecorded, quotaCheck, runGrade } from "@/lib/grading/live";

// POST /api/grade { sample } or { url } -> a stream of GradeEvent lines (application/x-ndjson).
// Judges and admins only. One Gemini call per run; at most DAILY_RUN_CAP runs a day and one at a time.
// If a run fails, the last stream line carries the most recent finished run, shown as a recording.
// Results stay in grading_runs and are never added to the BC map.
export const maxDuration = 120;
export const runtime = "nodejs";

// Per IP: 12 requests per 10 minutes (most fail fast and cost nothing; the daily cap guards the quota).
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 12;
}

export async function POST(request: Request) {
  const access = await graderAccess();
  if (!access.ok) return NextResponse.json({ error: "Grade a policy is for judges and admins." }, { status: access.signedIn ? 403 : 401 });
  if (limited(clientIp(request))) return NextResponse.json({ error: "That's a lot of runs at once. Try again in a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { sample?: unknown; url?: unknown } | null;
  const sample = typeof body?.sample === "string" ? SAMPLES.find((s) => s.id === body.sample) : undefined;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!sample && (!url || url.length > 2000)) return NextResponse.json({ error: "Choose a sample policy or paste a link to a PDF." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: GradeEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const quota = await quotaCheck();
      if (!quota.ok) {
        send({ type: "error", message: quota.message, recorded: await latestRecorded() });
        controller.close();
        return;
      }
      try {
        await runGrade(sample ? { kind: "sample", sample } : { kind: "url", url }, send);
      } catch (e) {
        const message = e instanceof UserFacingError ? e.message : "The live run didn't finish.";
        if (!(e instanceof UserFacingError)) console.log(JSON.stringify({ event: "grade_failed", error: (e as Error).message.slice(0, 200) }));
        send({ type: "error", message, recorded: await latestRecorded() });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
