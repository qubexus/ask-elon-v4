// Web read-aloud (mobile Safari / Chrome). Elon's replies are spoken by the server's neural voice (/api/tts, MP3).
//
// Browsers only let audio start from a user tap. The server needs a few seconds to generate the voice, and by then
// iOS Safari no longer treats play() as user-initiated. So one <audio> element is "unlocked" synchronously inside
// the tap (primeAudio) and later reused for the real file; once unlocked it may play without a new tap.
// If the server voice fails, the browser's own voice for the user's language is used as a fallback.
import { api, API_BASE } from "@/src/api";

export type SpeakOpts = {
  messageId: string;
  text: string;
  lang: "pl" | "en" | "ro";
  onStart: () => void;
  onDone: () => void;
};

// 0.05 s of silence (8 kHz, 8-bit mono WAV) used to unlock the element during a tap.
const SILENCE =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

let el: HTMLAudioElement | null = null;
let unlocked = false;
let seq = 0;
let onEnd: (() => void) | null = null;
const urls = new Map<string, { url: string; until: number }>(); // message_id -> signed audio URL until it expires

function audioEl(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  if (!el) {
    el = new Audio();
    el.preload = "auto";
    el.setAttribute("playsinline", "");
    el.setAttribute("data-testid", "elon-tts-audio");
    el.style.display = "none";
    document.body.appendChild(el);
    el.addEventListener("ended", () => finish());
  }
  return el;
}

function finish() {
  const cb = onEnd;
  onEnd = null;
  cb?.();
}

/** Must be called synchronously inside the tap handler (Listen button, Send button). */
export function primeAudio() {
  const a = audioEl();
  if (!a || unlocked) return;
  try {
    a.muted = true;
    a.src = SILENCE;
    const p = a.play();
    unlocked = true;
    p?.then(() => a.pause()).catch(() => (unlocked = false)).finally(() => (a.muted = false));
  } catch {
    unlocked = false;
  }
  // speechSynthesis also needs a gesture on iOS before it can speak later.
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  } catch {}
}

const LOCALE = { pl: "pl-PL", en: "en-GB", ro: "ro-RO" } as const;

function pickVoice(lang: keyof typeof LOCALE): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const mine = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online|enhanced|premium|google|siri/i.test(v.name) ? 2 : 0) +
    (v.lang.replace("_", "-").toLowerCase() === LOCALE[lang].toLowerCase() ? 1 : 0);
  return mine.sort((a, b) => score(b) - score(a))[0] || null;
}

function plain(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(?:https?:\/\/|www\.)\S+/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/[*_#>~|`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

/** Browser voice fallback. Returns false when the device has no usable voice. */
function speakWithBrowser(text: string, lang: keyof typeof LOCALE, mySeq: number, onStart: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(plain(text));
  u.lang = LOCALE[lang];
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = 1;
  u.onend = () => mySeq === seq && finish();
  u.onerror = () => mySeq === seq && finish();
  synth.cancel();
  synth.speak(u);
  onStart();
  return true;
}

export async function speakMessage({ messageId, text, lang, onStart, onDone }: SpeakOpts) {
  stopSpeaking();
  const mySeq = ++seq;
  onEnd = onDone;
  const a = audioEl();
  // Audio links are signed and expire (server: TTS_LINK_TTL); re-ask /tts shortly before that (cached = free).
  const hit = urls.get(messageId);
  let url = hit && hit.until > Date.now() ? hit.url : undefined;
  try {
    if (!url) {
      const res = await api<{ url: string; expires_in?: number }>("/tts", { method: "POST", body: { message_id: messageId } });
      url = `${API_BASE}${res.url.replace(/^\/api/, "")}`;
      urls.set(messageId, { url, until: Date.now() + Math.max(30, (res.expires_in ?? 900) - 60) * 1000 });
    }
    if (mySeq !== seq) return; // stopped or replaced meanwhile
    if (!a) throw new Error("no audio element");
    a.muted = false;
    a.src = url;
    await a.play();
    if (mySeq !== seq) return a.pause();
    onStart();
  } catch (e: any) {
    if (mySeq !== seq) return;
    const msg = String(e?.message || "");
    // 401 (logged out) and 429 (limit) are real answers, not voice problems.
    if (/Too many|Not authenticated|Invalid session/i.test(msg)) {
      onEnd = null;
      throw e;
    }
    if (e?.name === "NotAllowedError" && url) {
      // Autoplay refused (no unlocked tap). The file is ready: the next tap plays it instantly.
      onEnd = null;
      const err = new Error("tap-again");
      err.name = "TapAgain";
      throw err;
    }
    console.warn("server voice failed, using the browser voice", e);
    if (!speakWithBrowser(text, lang, mySeq, onStart)) {
      onEnd = null;
      throw e;
    }
  }
}

export function stopSpeaking() {
  seq++;
  try {
    el?.pause();
  } catch {}
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {}
  finish();
}
