// Native (iOS/Android) read-aloud. The web version lives in audio.web.ts (Metro picks it automatically).
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

import { api, API_BASE } from "@/src/api";

export type SpeakOpts = {
  messageId: string;
  text: string;
  lang: "pl" | "en" | "ro";
  onStart: () => void;
  onDone: () => void;
};

// One module-level player so only one reply is ever spoken at a time.
const player = createAudioPlayer(null);
let onEnd: (() => void) | null = null;
let seq = 0;

player.addListener("playbackStatusUpdate", (s) => {
  if (s.didJustFinish) {
    const cb = onEnd;
    onEnd = null;
    cb?.();
  }
});

/** Call synchronously inside the tap handler (needed on web; no-op on native). */
export function primeAudio() {}

export async function speakMessage({ messageId, onStart, onDone }: SpeakOpts) {
  stopSpeaking();
  const mySeq = ++seq;
  const { url } = await api<{ url: string }>("/tts", { method: "POST", body: { message_id: messageId } });
  if (mySeq !== seq) return; // a newer request or stop() happened meanwhile
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  player.replace({ uri: `${API_BASE}${url.replace(/^\/api/, "")}` });
  onEnd = onDone;
  player.play();
  onStart();
}

export function stopSpeaking() {
  seq++;
  const cb = onEnd;
  onEnd = null;
  try {
    player.pause();
  } catch {}
  cb?.();
}
