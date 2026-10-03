import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { speak, VoiceError } from "@/lib/elevenlabs";

// POST /api/voice/speak { text } -> audio/mpeg stream (ElevenLabs text to speech, the Sarah voice).
// Used to read an Ask answer aloud. Nothing is stored or logged.
// Limits: 1,200 characters per answer; 10 per minute per IP.

const MAX_CHARS = 1200;
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (limited(ip)) return NextResponse.json({ error: "Too many requests at once. Try again in a moment." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_CHARS) return NextResponse.json({ error: "Send the answer to read aloud." }, { status: 400 });

  try {
    const audio = await speak(text);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e) {
    const status = e instanceof VoiceError && e.status === 429 ? 429 : 502;
    return NextResponse.json({ error: "The answer couldn't be read aloud just now. It's shown on screen." }, { status });
  }
}
