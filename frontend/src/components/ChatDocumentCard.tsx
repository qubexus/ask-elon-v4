// Document card inside an Elon chat bubble. For a document that arrives live it plays a short entrance
// (~1.4 s, UI thread via Reanimated): a sheet of paper unrolls, lines get "typed", the PDF thumbnail pops out
// with a spring and the ask Elon stamp lands on it. Plays once per new document (never for history).
// prefers-reduced-motion: a plain 250 ms fade. The card never changes size, so the chat does not jump.
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";

import { useAuth } from "@/src/auth";
import { ChatDocCard, fileUrl, markPlayed, shouldAnimate, typeKey } from "@/src/chatDocuments";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { useReduceMotion } from "@/src/motion";
import { fx, makeStyles, useTheme } from "@/src/theme";

const STAMP = require("@/assets/brand/elon-stamp.png");
const LINES = [0.9, 0.75, 0.95, 0.6, 0.85, 0.7, 0.5];
const SLOT_H = 124;

type Props = { doc?: ChatDocCard; phase: "drafting" | "ready" | "error" | "gone"; errorText?: string; onOpen?: () => void };

export function ChatDocumentCard({ doc, phase, errorText, onOpen }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const { locale } = useAuth();
  const reduce = useReduceMotion();
  // Decided once at mount: animate only a document being written right now / just delivered by the stream.
  const [animate] = useState(() => phase === "drafting" || (!!doc && shouldAnimate(doc.chat_doc_id)));
  const [thumbOk, setThumbOk] = useState(true);

  const unroll = useSharedValue(animate ? 0 : 1);
  const lines = useSharedValue(animate ? 0 : 1);
  const pop = useSharedValue(animate || phase !== "ready" ? 0 : 1);
  const stamp = useSharedValue(animate || phase !== "ready" ? 0 : 1);
  const fade = useSharedValue(animate && reduce !== false ? 0 : 1);
  const started = useRef(false);
  const revealed = useRef(false);

  // One effect drives the whole entrance (Reanimated runs it on the UI thread; React only starts it):
  // 1) paper unrolls + lines get typed (looping while Elon is still writing), 2) when the document is ready,
  // the lines finish, the thumbnail pops out and the stamp lands.
  useEffect(() => {
    const ready = phase === "ready" && !!doc;
    if (!animate) {
      if (ready) { pop.value = 1; stamp.value = 1; }
      return;
    }
    if (reduce === null) return; // wait for the OS / browser setting
    if (!started.current) {
      started.current = true;
      if (reduce) {
        unroll.value = 1;
        lines.value = 1;
        fade.value = withTiming(1, { duration: 250 });
      } else {
        fade.value = 1;
        unroll.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
        lines.value = phase === "drafting"
          ? withDelay(150, withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withTiming(0.12, { duration: 0 })), -1))
          : withDelay(150, withTiming(1, { duration: 550, easing: Easing.out(Easing.quad) }));
      }
    }
    if (!ready || revealed.current) return;
    revealed.current = true;
    markPlayed(doc!.chat_doc_id);
    if (reduce) { // reduced motion: the thumbnail and stamp simply fade in, nothing moves or scales
      pop.value = withTiming(1, { duration: 250 });
      stamp.value = withTiming(1, { duration: 250 });
      return;
    }
    const wait = unroll.value < 1 ? 700 : 200; // arrived without a drafting phase: let the paper unroll first
    lines.value = withTiming(1, { duration: Math.max(150, wait - 50) });
    pop.value = withDelay(wait, withSpring(1, { damping: 11, stiffness: 190, mass: 0.7 }));
    stamp.value = withDelay(wait + 320, withSpring(1, { damping: 9, stiffness: 260, mass: 0.6 }));
  }, [animate, reduce, phase, doc?.chat_doc_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const paperStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: unroll.value }] }));
  const rollStyle = useAnimatedStyle(() => ({ transform: [{ translateY: unroll.value * (SLOT_H - 8) }], opacity: 1 - pop.value }));
  const still = !!reduce;
  const thumbStyle = useAnimatedStyle(() => (still ? { opacity: pop.value } : {
    opacity: Math.min(1, pop.value * 1.6), transform: [{ scale: 0.55 + 0.45 * pop.value }, { translateY: (1 - pop.value) * 14 }],
  }));
  const stampStyle = useAnimatedStyle(() => (still ? { opacity: stamp.value, transform: [{ rotate: "-12deg" }] } : {
    opacity: Math.min(1, stamp.value * 2),
    transform: [{ scale: 2.3 - 1.3 * stamp.value }, { rotate: `${-34 + 22 * stamp.value}deg` }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * pop.value }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const lineStyles = LINES.map((w, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const p = Math.max(0, Math.min(1, lines.value * LINES.length - i));
      return { width: `${w * 100 * p}%` as any };
    }),
  );

  if (phase === "error" || phase === "gone") {
    return (
      <View style={styles.note} testID={phase === "error" ? "chat-doc-error" : "chat-doc-gone"} accessibilityRole={phase === "error" ? "alert" : undefined}>
        <Ionicons name={phase === "error" ? "alert-circle-outline" : "trash-outline"} size={16} color={phase === "error" ? colors.error : colors.muted} />
        <Text style={styles.noteText}>{phase === "error" ? errorText || t("edGenError") : t("edGone")}</Text>
      </View>
    );
  }

  const ready = phase === "ready" && !!doc;
  const label = ready ? `${t("edOpenDoc")}: ${doc!.title}` : t("edDrafting");
  return (
    <Animated.View style={fadeStyle}>
      <Pressable
        onPress={onOpen}
        disabled={!ready}
        style={({ pressed }) => [styles.card, pressed && fx("cardPressed")]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !ready, busy: !ready }}
        testID={ready ? `chat-doc-card-${doc!.chat_doc_id}` : "chat-doc-drafting"}
      >
        <View style={styles.slot}>
          <Animated.View style={[styles.paper, paperStyle]}>
            <View style={styles.paperHead} />
            {LINES.map((_, i) => (
              <Animated.View key={i} style={[styles.line, lineStyles[i]]} />
            ))}
          </Animated.View>
          <Animated.View style={[styles.roll, rollStyle]} pointerEvents="none" />
          {ready && (
            <Animated.View style={[styles.thumbWrap, thumbStyle]} pointerEvents="none">
              {doc!.thumb_url && thumbOk ? (
                <Image source={{ uri: fileUrl(doc!.thumb_url) }} style={styles.thumb} contentFit="cover" contentPosition="top" onError={() => setThumbOk(false)} accessible={false} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}><Ionicons name="document-text" size={34} color="#0A2A5C" /></View>
              )}
              <View style={styles.pdfBadge}><Text style={styles.pdfText}>PDF</Text></View>
            </Animated.View>
          )}
          {ready && <Animated.Image source={STAMP} style={[styles.stamp, stampStyle]} accessibilityIgnoresInvertColors accessible={false} />}
        </View>
        <Animated.View style={[styles.col, ready ? textStyle : null]}>
          <Text style={styles.kind} numberOfLines={1}>{ready ? t(typeKey(doc!.type)) : t("edDrafting")}</Text>
          {ready ? (
            <>
              <Text style={styles.title} numberOfLines={3}>{doc!.title}</Text>
              <Text style={styles.meta} numberOfLines={2}>{formatDate(doc!.created_at, locale)} · {t("edSavedTo")}</Text>
              <View style={styles.openRow}>
                <Text style={styles.openText}>{t("edOpen")}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.askOrange} />
              </View>
            </>
          ) : (
            <View style={{ gap: 6, marginTop: 4 }}>
              <View style={[styles.skel, { width: "85%" }]} />
              <View style={[styles.skel, { width: "60%" }]} />
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { flexDirection: "row", gap: 12, marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, minWidth: 250, maxWidth: 360 },
  slot: { width: 92, height: SLOT_H, alignItems: "center" },
  paper: { width: 86, height: SLOT_H - 4, backgroundColor: "#FFFFFF", borderRadius: 4, paddingHorizontal: 9, paddingTop: 10, gap: 6, transformOrigin: "top", overflow: "hidden" },
  paperHead: { width: "45%", height: 5, borderRadius: 3, backgroundColor: "#0A2A5C", marginBottom: 4 },
  line: { height: 4, borderRadius: 2, backgroundColor: "#C9D3DE" },
  roll: { position: "absolute", top: 0, width: 92, height: 8, borderRadius: 4, backgroundColor: c.askOrange },
  thumbWrap: { position: "absolute", top: 0, left: 3, width: 86, height: SLOT_H - 4, borderRadius: 4, overflow: "hidden", backgroundColor: "#FFFFFF", ...fx("shadowOrangeSoft") },
  thumb: { width: "100%", height: "100%" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  pdfBadge: { position: "absolute", left: 4, bottom: 4, backgroundColor: "#D93A2B", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  pdfText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  stamp: { position: "absolute", right: -10, bottom: -8, width: 46, height: 46 },
  col: { flex: 1, minWidth: 0, justifyContent: "center", gap: 3 },
  kind: { color: c.askOrange, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  title: { color: c.onSurface, fontSize: 14.5, fontWeight: "800", lineHeight: 19 },
  meta: { color: c.muted, fontSize: 11.5, lineHeight: 15 },
  openRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 4 },
  openText: { color: c.askOrange, fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  skel: { height: 8, borderRadius: 4, backgroundColor: c.border },
  note: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: c.errorSoft },
  noteText: { flex: 1, color: c.onSurface, fontSize: 13, lineHeight: 18 },
}));
