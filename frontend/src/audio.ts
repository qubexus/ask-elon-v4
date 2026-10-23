import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

import { api, API_BASE } from "@/src/api";

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

export async function speakMessage(messageId: string, onStart: () => void, onDone: () => void) {
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
