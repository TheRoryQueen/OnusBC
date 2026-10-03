"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Ask in voice, browser side. Recording uses MediaRecorder and releases the microphone the moment it stops;
// the recording goes to /api/voice/transcribe and is never kept. Answers are played through the Web Audio
// API, which is unlocked by the tap that starts recording (iPhone Safari blocks audio started later).

const MAX_MS = 30_000;
// Auto-stop: once speech has been heard, this much quiet ends the recording. No speech at all in NO_SPEECH_MS
// cancels without uploading anything.
const SILENCE_MS = 1_500;
const NO_SPEECH_MS = 8_000;
const MIME = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

let sharedCtx: AudioContext | null = null;
/** Call inside a tap: creates or resumes the audio context so a later answer can play. */
export function unlockAudio() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  sharedCtx ??= new Ctx();
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

export type RecorderState = "idle" | "recording" | "transcribing";

export function useRecorder(onTranscript: (text: string) => void, onError: (message: string) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const cancelled = useRef(false);
  const timers = useRef<{ tick?: number; cap?: number; level?: number }>({});
  const heardSpeech = useRef(false);
  const meter = useRef<MediaStreamAudioSourceNode | null>(null);

  const release = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    meter.current?.disconnect();
    meter.current = null;
    window.clearInterval(timers.current.tick);
    window.clearTimeout(timers.current.cap);
    window.clearInterval(timers.current.level);
  };

  const start = useCallback(async () => {
    unlockAudio();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Voice isn't available in this browser. You can type your question instead.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Microphone access is off. Allow it in your browser, or type your question instead.");
      return;
    }
    const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    cancelled.current = false;
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      release();
      if (cancelled.current) { setState("idle"); return; }
      if (!heardSpeech.current) { setState("idle"); onError("We didn't catch a question. Try again, or type it instead."); return; }
      const type = r.mimeType || "audio/webm";
      const audio = new Blob(chunks, { type });
      chunks.length = 0;
      setState("transcribing");
      try {
        const form = new FormData();
        form.append("audio", audio, `question.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`);
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as { transcript?: string; error?: string };
        if (!res.ok) onError(json.error ?? "We couldn't hear that. Try again, or type your question.");
        else if (!json.transcript || json.transcript.length < 3) onError("We didn't catch a question. Try again, or type it instead.");
        else onTranscript(json.transcript);
      } catch {
        onError("You seem to be offline. Try again when you're connected.");
      } finally {
        setState("idle");
      }
    };
    rec.current = r;
    r.start();
    setElapsed(0);
    setState("recording");
    const t0 = Date.now();
    timers.current.tick = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    timers.current.cap = window.setTimeout(() => { if (r.state === "recording") r.stop(); }, MAX_MS);

    // Silence detection: measure loudness every 100 ms against the room's own background level.
    heardSpeech.current = false;
    const ctx = unlockAudio();
    if (ctx) {
      const src = ctx.createMediaStreamSource(stream.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      meter.current = src;
      const data = new Float32Array(analyser.fftSize);
      // Background level = the quietest moment so far (people often start talking right away, so the
      // first frames can't be trusted as background). Speech is clearly above it; capped so a loud room
      // still counts a voice as speech.
      let floor = Infinity, quietSince = 0;
      timers.current.level = window.setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += v * v;
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();
        floor = Math.min(floor, rms);
        const speaking = rms > Math.max(0.015, Math.min(floor * 3, 0.05));
        if (speaking) { heardSpeech.current = true; quietSince = 0; return; }
        if (!heardSpeech.current) { if (now - t0 > NO_SPEECH_MS && r.state === "recording") r.stop(); return; }
        quietSince ||= now;
        if (now - quietSince >= SILENCE_MS && r.state === "recording") r.stop();
      }, 100);
    } else {
      heardSpeech.current = true; // no meter available: rely on the tap to stop
    }
  }, [onError, onTranscript]);

  // A tap to stop counts as having spoken (the person decides), so it always sends.
  const stop = useCallback(() => { heardSpeech.current = true; if (rec.current?.state === "recording") rec.current.stop(); }, []);
  const cancel = useCallback(() => { cancelled.current = true; if (rec.current?.state === "recording") rec.current.stop(); }, []);

  // Leaving the Ask sheet mid-recording turns the microphone off.
  useEffect(() => () => { cancelled.current = true; if (rec.current?.state === "recording") rec.current.stop(); release(); }, []);

  return { state, elapsed, start, stop, cancel };
}

export function usePlayer() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current++;
    try { source.current?.stop(); } catch { /* already stopped */ }
    source.current = null;
    setPlaying(null);
    setLoading(null);
  }, []);

  /** Reads an answer aloud. Returns false if it couldn't (the answer stays on screen either way). */
  const play = useCallback(async (id: string, text: string) => {
    stop();
    const mine = ++token.current;
    const ctx = unlockAudio();
    if (!ctx) return false;
    // If the browser keeps audio blocked, give up quietly: the Listen button is the way to play it.
    if (ctx.state !== "running") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
    if (ctx.state !== "running") return false;
    setLoading(id);
    try {
      const res = await fetch("/api/voice/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error(String(res.status));
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      if (mine !== token.current) return true;
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.connect(ctx.destination);
      s.onended = () => { if (source.current === s) { source.current = null; setPlaying(null); } };
      source.current = s;
      setLoading(null);
      setPlaying(id);
      s.start();
      return true;
    } catch {
      if (mine === token.current) { setLoading(null); setPlaying(null); }
      return false;
    }
  }, [stop]);

  useEffect(() => () => { try { source.current?.stop(); } catch { /* already stopped */ } }, []);

  return { playing, loading, play, stop };
}
