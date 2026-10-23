import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { withBrand } from "@/src/components/BrandName";
import { api, streamChat } from "@/src/api";
import { primeAudio, speakMessage, stopSpeaking } from "@/src/audio";
import { storage } from "@/src/utils/storage";
import { VoiceInputButton } from "@/src/components/VoiceInputButton";
import { isOverdue, Letter, reportToAcas } from "@/src/components/SentLetters";
import { ProLock } from "@/src/components/ProLock";
import { StatusPill } from "@/src/components/StatusPill";
import { descriptionIsFirstMessage } from "@/src/caseChat";
import { formatDate } from "@/src/format";
import { usePro } from "@/src/revenuecat";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { fx, makeStyles, useTheme } from "@/src/theme";
import { useWebKeyboardOpen } from "@/src/webKeyboard";

type Msg = { message_id: string; role: "user" | "assistant"; text: string };
export type ChatCase = { case_id: string; title: string; description: string; sector: string; status: string; created_at: string; updated_at: string };

// Renders **bold** segments from AI markdown.
function RichText({ text, style, boldStyle }: { text: string; style: any; boldStyle: any }) {
  const clean = text.replace(/^#{1,6}\s*/gm, "").replace(/^\s*[*-]\s+/gm, "• ");
  const parts = clean.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <Text key={i} style={boldStyle}>{p.slice(2, -2)}</Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

function ElonTag({ styles }: { styles: any }) {
  return (
    <View style={styles.senderRow}>
      <Image source={require("@/assets/brand/robot-header.png")} style={styles.avatar} contentFit="contain" accessible={false} alt="" />
      <Text style={styles.sender}>Elon</Text>
    </View>
  );
}

// Top of a case chat: the case card (status, title, sector, way back) and the texts the case was created with.
function CaseIntro({ c, messages, locale, styles, t }: { c: ChatCase; messages: Msg[]; locale: any; styles: any; t: ReturnType<typeof useT> }) {
  const { colors } = useTheme();
  const showDesc = !descriptionIsFirstMessage(c.description, messages);
  return (
    <View style={{ gap: 12 }} testID="chat-case-intro">
      <View style={styles.caseCard} testID="chat-case-card">
        <View style={styles.caseTop}>
          <StatusPill status={c.status} />
          <Pressable
            testID="chat-case-all-cases"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/cases"))}
            hitSlop={8}
            style={styles.caseLink}
          >
            <Ionicons name="chevron-back" size={14} color={colors.brandPrimaryText} />
            <Text style={styles.caseLinkText}>{t("caseChatAllCases")}</Text>
          </Pressable>
        </View>
        <Text style={styles.caseTitle} testID="chat-case-title">{c.title}</Text>
        {!!c.sector && (
          <View style={styles.caseSector}>
            <Ionicons name="business-outline" size={14} color={colors.muted} />
            <Text style={styles.caseSectorText} numberOfLines={1}>{c.sector}</Text>
          </View>
        )}
        <Pressable testID="chat-case-details" onPress={() => router.push(`/case/${c.case_id}`)} hitSlop={6} style={styles.caseLink}>
          <Ionicons name="information-circle-outline" size={14} color={colors.brandPrimaryText} />
          <Text style={styles.caseLinkText}>{t("caseChatDetails")}</Text>
        </Pressable>
      </View>
      {showDesc && (
        <View style={[styles.bubble, styles.user]} testID="chat-case-description">
          <Text style={styles.caseOrigLabel}>{t("caseChatOriginal", { date: formatDate(c.created_at, locale) })}</Text>
          <Text style={styles.userText}>{c.description}</Text>
        </View>
      )}
      {messages.length === 0 && <Text style={styles.caseHint} testID="chat-case-hint">{t("caseChatHint")}</Text>}
    </View>
  );
}

type ChatProps = { threadId: string; bottomOffset: number; isMain?: boolean; onSavedAsCase?: () => void; caseId?: string; onCaseLoaded?: (c: ChatCase) => void };

export function ChatView(props: ChatProps) {
  const { user } = useAuth();
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  if (user?.profile_complete) return <ChatInner {...props} />;
  return (
    <View style={styles.locked} testID="chat-locked">
      <View style={styles.lockIcon}><Ionicons name="lock-closed" size={30} color={colors.onBrandPrimary} /></View>
      <Text style={styles.lockTitle}>{t("chatLockedTitle")}</Text>
      <Text style={styles.lockSub}>{t("chatLockedSub")}</Text>
      <Pressable testID="chat-complete-profile-button" onPress={() => router.push("/profile?tab=data")} style={styles.lockCta}>
        <Text style={styles.lockCtaText}>{t("completeProfile")}</Text>
      </Pressable>
    </View>
  );
}

function ChatInner({ threadId, bottomOffset, isMain, onSavedAsCase, caseId, onCaseLoaded }: ChatProps) {
  const { user, locale } = useAuth();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [caseDoc, setCaseDoc] = useState<ChatCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<FlatList>(null);
  // Auto-scroll only while the reader is at the bottom; reading older messages is never interrupted.
  const nearBottom = useRef(true);
  const scrolledOnce = useRef(false);
  const autoScrollAt = useRef(0);
  const webKeyboard = useWebKeyboardOpen();
  const idRef = useRef(0);
  const [needContract, setNeedContract] = useState(false);
  const [overdue, setOverdue] = useState<Letter | null>(null);
  const [broadcasts, setBroadcasts] = useState<{ broadcast_id: string; text: string; author: string }[]>([]);
  const [speaking, setSpeaking] = useState<{ id: string; phase: "loading" | "playing" } | null>(null);
  const isPro = usePro();
  const [usage, setUsage] = useState<{ today: number; days_since_signup: number; free_daily: number; trial_days: number } | null>(null);
  const trialOver = !!usage && usage.days_since_signup >= usage.trial_days;
  const left = usage ? Math.max(0, usage.free_daily - usage.today) : 0;
  const freeBlocked = !isPro && !!usage && (trialOver || left <= 0);

  useFocusEffect(useCallback(() => () => stopSpeaking(), []));

  // Read-aloud: Listen button on every Elon reply, plus an optional "read replies aloud" switch (saved per device).
  const [autoRead, setAutoRead] = useState(false);
  const autoReadRef = useRef(false);
  useEffect(() => {
    storage.getItem("ae.autoRead", false).then((v) => {
      autoReadRef.current = !!v;
      setAutoRead(!!v);
    });
  }, []);
  const toggleAutoRead = () => {
    primeAudio();
    const next = !autoReadRef.current;
    autoReadRef.current = next;
    setAutoRead(next);
    storage.setItem("ae.autoRead", next);
    if (!next) {
      stopSpeaking();
      setSpeaking(null);
    }
    toast(t(next ? "autoReadOnToast" : "autoReadOffToast"));
  };

  const speak = async (id: string, text: string, quiet = false) => {
    setSpeaking({ id, phase: "loading" });
    try {
      await speakMessage({
        messageId: id,
        text,
        lang: locale,
        onStart: () => setSpeaking({ id, phase: "playing" }),
        onDone: () => setSpeaking((s) => (s?.id === id ? null : s)),
      });
    } catch (e: any) {
      setSpeaking((s) => (s?.id === id ? null : s));
      if (e?.name === "TapAgain") {
        if (!quiet) toast(t("ttsTapAgain"));
        return;
      }
      console.warn("tts failed", e);
      if (!quiet) toast(/Too many/i.test(String(e?.message)) ? t("ttsLimit") : t("ttsError"), "error");
    }
  };

  const toggleSpeak = (id: string, text: string) => {
    if (speaking?.id === id) {
      stopSpeaking();
      setSpeaking(null);
      return;
    }
    primeAudio(); // synchronously inside the tap – lets the browser play the voice a few seconds later
    speak(id, text);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Case chat: load the case itself (its original description) together with that case's own message thread.
      const [msgs, c] = await Promise.all([
        api<Msg[]>(`/chat/messages?thread_id=${encodeURIComponent(threadId)}`),
        caseId ? api<ChatCase>(`/cases/${encodeURIComponent(caseId)}`) : Promise.resolve(null),
      ]);
      setMessages(msgs);
      setCaseDoc(c);
      if (c) onCaseLoaded?.(c);
      api<typeof usage>("/chat/usage").then(setUsage).catch(() => {});
      if (isMain) {
        api<{ broadcast_id: string; text: string; author: string }[]>("/broadcasts/pending").then((b) => b.length && setBroadcasts(b)).catch(() => {});
        api<Letter[]>("/letters").then((l) => setOverdue(l.find(isOverdue) ?? null)).catch(() => {});
      }
      if (!caseId) api<{ category: string; status: string }[]>("/documents")
        .then((d) => setNeedContract(!d.some((x) => x.category === "contract" && x.status !== "failed")))
        .catch(() => {});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [threadId, caseId]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || streaming || freeBlocked) return;
    if (autoReadRef.current) primeAudio();
    setInput("");
    nearBottom.current = true;
    const stamp = idRef.current++;
    const aiId = `ai_${stamp}`;
    setMessages((m) => [...m, { message_id: `u_${stamp}`, role: "user", text: msg }, { message_id: aiId, role: "assistant", text: "" }]);
    setStreaming(true);
    try {
      let replyText = "";
      const realId = await streamChat(msg, threadId, (d) => {
        replyText += d;
        setMessages((m) => m.map((x) => (x.message_id === aiId ? { ...x, text: x.text + d } : x)));
      });
      if (realId) {
        setMessages((m) => m.map((x) => (x.message_id === aiId ? { ...x, message_id: realId } : x)));
        if (autoReadRef.current && replyText.trim()) speak(realId, replyText, true);
      }
      setUsage((u) => (u ? { ...u, today: u.today + 1 } : u));
    } catch {
      toast(t("aiError"), "error");
      setMessages((m) => m.filter((x) => !(x.message_id === aiId && !x.text)));
    } finally {
      setStreaming(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const saveAsCase = async () => {
    setSaving(true);
    try {
      const c = await api<{ case_id: string; title: string }>("/cases/from-thread", { method: "POST", body: { thread_id: threadId } });
      toast(t("chatSavedCase"));
      onSavedAsCase?.();
      router.push({ pathname: "/chat/[threadId]", params: { threadId: c.case_id, title: c.title } });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const canSend = !!input.trim() && !streaming;
  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentSize.height - layoutMeasurement.height - contentOffset.y < 120) nearBottom.current = true;
    // Ignore the scroll events of our own scrollToEnd (content may still be growing under it).
    else if (Date.now() - autoScrollAt.current > 600) nearBottom.current = false;
  };
  const followBottom = (animated: boolean) => {
    if (scrolledOnce.current && !nearBottom.current) return;
    autoScrollAt.current = Date.now();
    const anim = scrolledOnce.current && animated;
    // Web: FlatList.scrollToEnd aims at an estimated end while rows are still being rendered and stops short;
    // an oversized offset is clamped by the browser to the real bottom.
    if (Platform.OS === "web") listRef.current?.scrollToOffset({ offset: 1e7, animated: anim });
    else listRef.current?.scrollToEnd({ animated: anim });
    scrolledOnce.current = true;
  };
  // With the web keyboard open there is no tab bar or home indicator under the composer.
  const composerBottom = webKeyboard ? 10 : (bottomOffset > 0 ? 28 : insets.bottom) + 12;
  const firstName = (user?.name || "").split(" ")[0] || "";
  const welcome = t("welcome", { name: firstName });
  const quick = [t("q1"), t("q2"), t("q3"), t("q4")];

  if (loading) {
    return (
      <View style={styles.center} testID="chat-loading">
        <ActivityIndicator color={colors.brandPrimaryText} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center} testID="chat-error">
        <Text style={styles.muted}>{t("loadError")}</Text>
        <Pressable testID="chat-retry-button" onPress={load} style={styles.retry}>
          <Text style={styles.retryText}>{t("retry")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {overdue && (
        <View style={[styles.banner, styles.overdue]} testID="chat-acas-banner">
          <Ionicons name="alarm-outline" size={18} color={colors.error} />
          <Text style={styles.bannerText}>{t("overdueBanner", { title: overdue.title })}</Text>
          <Pressable
            testID="chat-acas-button"
            hitSlop={8}
            onPress={async () => {
              try {
                await reportToAcas(overdue.letter_id);
                setOverdue(null);
              } catch (e: any) {
                toast(e.message, "error");
              }
            }}
          >
            <Text style={[styles.bannerCta, { color: colors.error }]}>{t("letterAcas")} →</Text>
          </Pressable>
        </View>
      )}
      {needContract && (
        <Pressable testID="chat-add-contract-banner" onPress={() => router.push("/profile?tab=docs")} style={styles.banner}>
          <Ionicons name="document-attach-outline" size={18} color={colors.brandPrimaryText} />
          <Text style={styles.bannerText}>{t("addContractBanner")}</Text>
          <Text style={styles.bannerCta}>{t("addContract")} →</Text>
        </Pressable>
      )}
      <FlatList
        ref={listRef}
        testID="chat-message-list"
        data={messages}
        keyExtractor={(m) => m.message_id}
        style={styles.listBox}
        contentContainerStyle={styles.list}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={onListScroll}
        onContentSizeChange={() => followBottom(true)}
        // Keyboard opening shrinks the list: keep the newest message in view if the reader was at the bottom.
        onLayout={() => followBottom(false)}
        ListHeaderComponent={
          <View>
            {broadcasts.map((b) => (
              <View key={b.broadcast_id} style={styles.system} testID="chat-system-broadcast">
                <View style={styles.systemHead}>
                  <Ionicons name="megaphone" size={14} color={colors.onWarning} />
                  <Text style={styles.systemLabel}>KOMUNIKAT SYSTEMOWY · ADMIN</Text>
                </View>
                <Text style={styles.systemText}>{b.text}</Text>
              </View>
            ))}
            {caseDoc ? (
              <CaseIntro c={caseDoc} messages={messages} locale={locale} styles={styles} t={t} />
            ) : (
              <>
              <View style={[styles.bubble, styles.ai]} testID="chat-welcome-message">
                <ElonTag styles={styles} />
                <Text style={styles.aiText}>{withBrand(welcome, "soft")}</Text>
              </View>
              {messages.length === 0 && (
                <View style={styles.quickWrap}>
                  {quick.map((q, i) => (
                    <Pressable key={i} testID={`quick-action-${i}`} onPress={() => send(q)} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7 }]}>
                      <Ionicons name="flash-outline" size={14} color={colors.askOrange} />
                      <Text style={styles.quickText}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) =>
          item.role === "user" ? (
            <Animated.View entering={FadeInUp.duration(250)} style={[styles.bubble, styles.user]} testID="chat-user-message">
              <Text style={styles.userText}>{item.text}</Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInUp.duration(250)} style={[styles.bubble, styles.ai]} testID="chat-ai-message">
              <ElonTag styles={styles} />
              {item.text ? (
                <>
                  <RichText text={item.text} style={styles.aiText} boldStyle={styles.bold} />
                  {item.message_id.startsWith("msg_") && (
                    <Pressable
                      testID={`chat-listen-button-${item.message_id}`}
                      onPress={() => toggleSpeak(item.message_id, item.text)}
                      accessibilityRole="button"
                      accessibilityLabel={speaking?.id === item.message_id ? t("stopListen") : t("listen")}
                      style={({ pressed }) => [styles.listen, pressed && { opacity: 0.7 }]}
                      hitSlop={6}
                    >
                      {speaking?.id === item.message_id && speaking?.phase === "loading" ? (
                        <ActivityIndicator size="small" color={colors.brandPrimaryText} />
                      ) : (
                        <Ionicons name={speaking?.id === item.message_id ? "stop-circle" : "volume-high-outline"} size={16} color={colors.brandPrimaryText} />
                      )}
                      <Text style={styles.listenText}>{speaking?.id === item.message_id ? t("stopListen") : t("listen")}</Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <ActivityIndicator testID="chat-typing-indicator" color={colors.brandPrimaryText} style={{ alignSelf: "flex-start" }} />
              )}
            </Animated.View>
          )
        }
      />
      {freeBlocked ? (
        <View style={{ padding: 12, paddingBottom: composerBottom, flexShrink: 0 }}>
          <ProLock testID="chat-free-lock" text={trialOver ? t("freeTrialOver") : t("freeLimitReached")} />
        </View>
      ) : (
      <KeyboardStickyView offset={{ closed: 0, opened: bottomOffset }} style={styles.composerBox} testID="chat-composer">
        <View style={styles.toolsRow}>
          {isMain && messages.length > 0 && !streaming && (
            <Pressable testID="chat-save-as-case" onPress={saveAsCase} disabled={saving} hitSlop={8} style={styles.saveCase}>
              <Ionicons name="add-circle-outline" size={13} color={colors.muted} />
              <Text style={styles.saveCaseText}>{t("chatSaveCase")}</Text>
            </Pressable>
          )}
          <Pressable
            testID="chat-auto-read-toggle"
            onPress={toggleAutoRead}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: autoRead }}
            style={[styles.autoRead, autoRead && styles.autoReadOn]}
          >
            <Ionicons name={autoRead ? "volume-high" : "volume-mute-outline"} size={13} color={autoRead ? colors.askOrange : colors.muted} />
            <Text style={[styles.autoReadText, autoRead && { color: colors.askOrange }]}>{t(autoRead ? "autoReadOn" : "autoReadOff")}</Text>
          </Pressable>
        </View>
        {!isPro && usage && (
          <Pressable testID="chat-free-counter" onPress={() => router.push("/paywall")} style={styles.freeBar}>
            <Ionicons name="time-outline" size={14} color={colors.gold} />
            <Text style={styles.freeText}>{t("freeLeft", { n: String(left), d: String(Math.max(0, usage.trial_days - usage.days_since_signup)) })}</Text>
          </Pressable>
        )}
        <View style={[styles.composer, { paddingBottom: composerBottom }]}>
          <VoiceInputButton disabled={streaming} onText={(txt) => setInput((cur) => (cur.trim() ? `${cur.trim()} ${txt}` : txt))} />
          <TextInput
            testID="chat-input"
            value={input}
            onChangeText={setInput}
            placeholder={caseDoc ? t("caseChatPlaceholder") : t("placeholder")}
            placeholderTextColor={colors.muted}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            style={[styles.input, inputFocused && fx("focusRing"), inputFocused && styles.inputFocused]}
            multiline
          />
          <Pressable
            testID="chat-send-button"
            onPress={() => send(input)}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            style={({ pressed }) => [styles.send, canSend ? [styles.sendReady, pressed ? fx("glowOrange") : fx("shadowOrangeSoft")] : { opacity: 0.35 }]}
          >
            {streaming ? <ActivityIndicator color={colors.onAccent} size="small" /> : <Ionicons name="arrow-up" size={22} color={canSend ? colors.onAccent : colors.onBrandPrimary} />}
          </Pressable>
        </View>
      </KeyboardStickyView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  system: { backgroundColor: c.warningSoft, borderWidth: 1.5, borderColor: c.warning, borderRadius: 14, padding: 12, gap: 6, marginBottom: 12 },
  systemHead: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: c.warning, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  systemLabel: { color: c.onWarning, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  systemText: { color: c.onSurface, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  lockIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  lockTitle: { color: c.onSurface, fontSize: 20, fontWeight: "900", textAlign: "center" },
  lockSub: { color: c.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  lockCta: { minHeight: 50, paddingHorizontal: 24, borderRadius: 12, backgroundColor: c.brandPrimary, justifyContent: "center", marginTop: 8 },
  lockCtaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.brandPrimarySoft, borderBottomWidth: 1, borderBottomColor: c.border },
  overdue: { backgroundColor: c.surfaceSecondary, borderBottomColor: c.error, borderBottomWidth: 2 },
  bannerText: { flex: 1, color: c.onSurface, fontSize: 12, fontWeight: "600" },
  bannerCta: { color: c.brandPrimaryText, fontSize: 12, fontWeight: "800", flexShrink: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: c.muted, fontSize: 14 },
  retry: { backgroundColor: c.brandPrimary, paddingHorizontal: 20, height: 44, borderRadius: 12, justifyContent: "center" },
  retryText: { color: c.onBrandPrimary, fontWeight: "700" },
  // The message list is the only thing that scrolls; the page itself never does (web: no scroll chaining to the page).
  listBox: { flex: 1, minHeight: 0, ...(Platform.OS === "web" ? ({ overscrollBehavior: "contain" } as any) : null) },
  composerBox: { flexShrink: 0 },
  list: { padding: 16, gap: 12 },
  bubble: { maxWidth: "86%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  ai: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 6 },
  user: { alignSelf: "flex-end", backgroundColor: c.brandPrimary, borderBottomRightRadius: 6 },
  sender: { color: c.brandPrimaryText, fontWeight: "900", fontSize: 12 },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  avatar: { width: 28, height: 28 },
  aiText: { color: c.onSurface, fontSize: 14, lineHeight: 21, fontWeight: "500" },
  bold: { fontWeight: "800" },
  listen: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 8, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary },
  toolsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, marginBottom: 2, minHeight: 26 },
  autoRead: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto", marginBottom: 2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: c.border },
  autoReadOn: { borderColor: c.askOrange },
  autoReadText: { color: c.muted, fontSize: 11, fontWeight: "700" },
  listenText: { color: c.brandPrimaryText, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  userText: { color: c.onBrandPrimary, fontSize: 14, lineHeight: 21, fontWeight: "500" },
  quickWrap: { gap: 8, marginTop: 12 },
  quick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: c.surfaceTertiary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 40,
  },
  quickText: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 14 },
  caseCard: { backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: c.askOrange, padding: 14, gap: 8 },
  caseTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  caseTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900", lineHeight: 24 },
  caseSector: { flexDirection: "row", alignItems: "center", gap: 6 },
  caseSectorText: { color: c.muted, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  caseLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 28 },
  caseLinkText: { color: c.brandPrimaryText, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  caseOrigLabel: { color: c.onBrandPrimary, opacity: 0.75, fontSize: 11, fontWeight: "800", letterSpacing: 0.4, marginBottom: 4 },
  caseHint: { color: c.muted, fontSize: 13, lineHeight: 19, textAlign: "center", paddingHorizontal: 12 },
  saveCase: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 2, borderRadius: 999 },
  saveCaseText: { color: c.muted, fontSize: 11, fontWeight: "600" },
  freeBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6, backgroundColor: c.goldSoft },
  freeText: { color: c.onSurface, fontSize: 12, fontWeight: "700" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: c.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: c.surfaceTertiary,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.borderStrong,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    // 16 px on web: iOS Safari zooms the page into any smaller input on focus.
    fontSize: Platform.OS === "web" ? 16 : 15,
    color: c.onSurface,
  },
  inputFocused: { borderColor: c.askOrange },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendReady: { backgroundColor: c.askOrange },
}));
