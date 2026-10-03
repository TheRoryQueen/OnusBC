import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { transcribe, VoiceError } from "@/lib/elevenlabs";

// POST /api/voice/transcribe (multipart: audio) -> { transcript }
// The recording is read into memory, sent to ElevenLabs speech to text, and dropped when the request ends.
// It is never written to disk or storage, and neither the audio nor the transcript is logged.
// Limits: 5 MB per recording; 10 recordings per minute per IP.

const MAX_BYTES = 5 * 1024 * 1024;
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
  if (limited(ip)) return NextResponse.json({ error: "Too many recordings at once. Try again in a moment." }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: "Send a recording." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "That recording is too long. Keep questions under a minute." }, { status: 413 });
  if (audio.type && !audio.type.startsWith("audio/") && audio.type !== "video/webm") {
    return NextResponse.json({ error: "That isn't an audio recording." }, { status: 415 });
  }

  try {
    const name = audio instanceof File && audio.name ? audio.name : "question.webm";
    const transcript = await transcribe(audio, name);
    return NextResponse.json({ transcript });
  } catch (e) {
    const status = e instanceof VoiceError && e.status === 429 ? 429 : 502;
    return NextResponse.json(
      { error: status === 429 ? "Voice is busy right now. Try again in a moment, or type your question." : "We couldn't hear that. Try again, or type your question." },
      { status }
    );
  }
}
