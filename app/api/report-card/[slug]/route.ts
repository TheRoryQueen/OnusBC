import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { getInstitution } from "@/lib/data/institutions";
import { speak, VoiceError } from "@/lib/elevenlabs";
import { reportCardText } from "@/lib/report-card";

// GET /api/report-card/<slug> -> audio/mpeg: the school's report card read aloud (Sarah voice).
// The text comes only from stored data (lib/report-card.ts), never from AI. Audio is cached per school:
// in this server's memory keyed by a hash of the text (so it regenerates only when the data changes), and
// at the CDN for a day. ElevenLabs is called only on a cache miss, at most 10 misses a minute per IP.
export const runtime = "nodejs";

const cache = new Map<string, Uint8Array>();
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ error: "Unknown school." }, { status: 404 });
  const school = await getInstitution(slug).catch(() => null);
  if (!school) return NextResponse.json({ error: "Unknown school." }, { status: 404 });

  const text = reportCardText(school);
  const key = `${slug}:${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
  let audio = cache.get(key);
  if (!audio) {
    if (limited(clientIp(request))) return NextResponse.json({ error: "Too many requests at once. Try again in a moment." }, { status: 429 });
    try {
      const stream = await speak(text);
      audio = new Uint8Array(await new Response(stream).arrayBuffer());
      cache.set(key, audio);
      console.log(JSON.stringify({ event: "report_card_audio", slug, chars: text.length }));
    } catch (e) {
      const status = e instanceof VoiceError && e.status === 429 ? 429 : 502;
      return NextResponse.json({ error: "The report card couldn't be read aloud just now." }, { status });
    }
  }
  return new Response(audio as BodyInit, {
    headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800", etag: `"${key}"` },
  });
}
