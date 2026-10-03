import "server-only";

// ElevenLabs for Ask in voice (PRD, Voice design decision): speech to text, then the same /api/ask as
// text mode, then text to speech with the Sarah voice. Audio is only ever held in memory for the length of
// one request; nothing is written to disk or storage, and nothing here logs the audio or the words.

const API = "https://api.elevenlabs.io/v1";
export const STT_MODEL = "scribe_v1";
export const TTS_MODEL = "eleven_flash_v2_5"; // the low-latency voice model
// Flash covers English, French, Mandarin and 29 other languages but not Farsi or Punjabi; Eleven v3 covers
// 70+ languages including both (elevenlabs.io/docs/overview/models). Each answer uses the fastest model
// that speaks its language, always with the Sarah voice.
export const TTS_MODEL_WIDE = "eleven_v3";
const FLASH_LANGS = new Set(["en", "ja", "zh", "de", "hi", "fr", "ko", "pt", "it", "es", "id", "nl", "tr", "fil", "pl", "sv", "bg", "ro", "ar", "cs", "el", "fi", "hr", "ms", "sk", "da", "ta", "uk", "ru", "hu", "no", "vi"]);
export const ttsModelFor = (lang = "en") => (FLASH_LANGS.has(lang.toLowerCase()) ? TTS_MODEL : TTS_MODEL_WIDE);
const TIMEOUT_MS = 20_000;

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY is not set");
  return k;
}
function voiceId() {
  const v = process.env.ELEVENLABS_VOICE_ID;
  if (!v) throw new Error("ELEVENLABS_VOICE_ID is not set");
  return v;
}

export class VoiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Speech to text. Returns the transcript, or "" if nothing was said. */
export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("model_id", STT_MODEL);
  form.append("file", audio, filename);
  form.append("tag_audio_events", "false");
  // No language_code: Scribe detects the language, so a question can be asked in Farsi, Punjabi or Mandarin.
  const res = await fetch(`${API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": key() },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new VoiceError(res.status, `speech-to-text ${res.status}`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/** Text to speech with the configured voice. Returns the MP3 stream to pass straight to the browser. */
export async function speak(text: string, lang = "en"): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${API}/text-to-speech/${voiceId()}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: ttsModelFor(lang) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new VoiceError(res.status, `text-to-speech ${res.status}`);
  return res.body;
}
