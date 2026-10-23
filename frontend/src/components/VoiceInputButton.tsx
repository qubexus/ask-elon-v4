import Ionicons from "@react-native-vector-icons/ionicons";
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { API_BASE, getApiToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { stopSpeaking } from "@/src/audio";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

type Phase = "idle" | "recording" | "transcribing";
const MAX_MS = 120_000;

async function upload(uri: string, language: string): Promise<string> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("audio", blob as any, "recording.webm");
  } else {
    form.append("audio", new File(uri) as any, "recording.m4a");
  }
  form.append("language", language);
  const res = await expoFetch(`${API_BASE}/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiToken()}` },
    body: form as any,
  });
  if (!res.ok) throw new Error(`Transcription error ${res.status}`);
  return ((await res.json()).text as string) ?? "";
}

// Dictation mic: tap to start, tap to stop; transcript is appended to the composer.
export function VoiceInputButton({ onText, disabled }: { onText: (t: string) => void; disabled?: boolean }) {
  const { locale } = useAuth();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<Phase>("idle");
  const [blocked, setBlocked] = useState(false);
  const preparing = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turn = useRef(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = phase === "recording" ? withRepeat(withTiming(1.25, { duration: 600 }), -1, true) : withTiming(1);
  }, [phase, pulse]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: phase === "recording" ? 0.35 : 0 }));

  useFocusEffect(
    useCallback(() => {
      getRecordingPermissionsAsync().then((p) => setBlocked(!p.granted && !p.canAskAgain)).catch(() => {});
      return () => {
        if (watchdog.current) clearTimeout(watchdog.current);
        try {
          if (recorder.isRecording) recorder.stop().catch(() => {});
        } catch {
          // recorder already released on unmount
        }
      };
    }, [recorder]),
  );

  const stop = async () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    const myTurn = ++turn.current;
    setPhase("transcribing");
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error("no recording");
      const text = await upload(uri, locale);
      if (myTurn !== turn.current) return;
      if (text) onText(text);
      else toast(t("voiceEmpty"), "error");
    } catch (e) {
      console.warn("voice: transcribe stage failed", e);
      toast(t("voiceError"), "error");
    } finally {
      setPhase("idle");
    }
  };

  const start = async () => {
    if (preparing.current) return;
    preparing.current = true;
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setBlocked(!perm.canAskAgain);
        toast(t("micDenied"), "error");
        return;
      }
      setBlocked(false);
      stopSpeaking();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase("recording");
      watchdog.current = setTimeout(stop, MAX_MS);
    } catch (e) {
      console.warn("voice: record stage failed", e);
      toast(t("voiceError"), "error");
      setPhase("idle");
    } finally {
      preparing.current = false;
    }
  };

  const onPress = () => (phase === "recording" ? stop() : phase === "idle" ? start() : undefined);
  const secs = Math.floor((state.durationMillis ?? 0) / 1000);

  return (
    <>
      {blocked && phase === "idle" && (
        <View style={styles.banner} testID="mic-blocked-banner">
          <Text style={styles.bannerText}>{t("micBlocked")}</Text>
          <Pressable testID="mic-open-settings-button" onPress={() => Linking.openSettings()} style={styles.bannerBtn}>
            <Text style={styles.bannerBtnText}>{t("openSettings")}</Text>
          </Pressable>
        </View>
      )}
      {phase === "recording" && (
        <Text style={styles.timer} testID="voice-recording-timer">
          {t("listening")} 0:{String(secs).padStart(2, "0")}
        </Text>
      )}
      <View>
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        <Pressable
          testID="chat-mic-button"
          onPress={onPress}
          disabled={disabled || phase === "transcribing"}
          accessibilityLabel={t("dictate")}
          style={[styles.mic, phase === "recording" && styles.micActive, disabled && { opacity: 0.4 }]}
        >
          {phase === "transcribing" ? (
            <ActivityIndicator color={colors.brandPrimary} size="small" />
          ) : (
            <Ionicons name={phase === "recording" ? "stop" : "mic"} size={20} color={phase === "recording" ? colors.onError : colors.brandPrimary} />
          )}
        </Pressable>
      </View>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  mic: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  micActive: { backgroundColor: c.error, borderColor: c.error },
  ring: { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: c.error },
  timer: { position: "absolute", top: -26, left: 16, color: c.error, fontSize: 12, fontWeight: "800" },
  banner: { position: "absolute", bottom: "100%", left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: c.warningSoft, borderTopWidth: 1, borderTopColor: c.border },
  bannerText: { flex: 1, color: c.onSurface, fontSize: 13, fontWeight: "500" },
  bannerBtn: { paddingHorizontal: 12, minHeight: 36, borderRadius: 10, backgroundColor: c.brandPrimary, justifyContent: "center" },
  bannerBtnText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
}));
