import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { API_BASE, getApiToken } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { StringKey, useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

type Page = { uri: string; name: string; type: string; file?: Blob };
type Phase = "idle" | "tips" | "explain" | "blocked" | "checking" | "rejected" | "uploading";

const TIPS: [any, StringKey][] = [
  ["sunny-outline", "scanTip1"],
  ["scan-outline", "scanTip2"],
  ["phone-portrait-outline", "scanTip3"],
  ["hand-left-outline", "scanTip4"],
];
const MAX_PAGES = 15;

async function appendFile(form: FormData, field: string, p: Page) {
  if (Platform.OS === "web") form.append(field, (p.file ?? (await (await fetch(p.uri)).blob())) as any, p.name);
  else form.append(field, { uri: p.uri, name: p.name, type: p.type } as any);
}

async function post(path: string, form: FormData) {
  const r = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${getApiToken()}` }, body: form });
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try {
      msg = (await r.json()).detail ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

/** Guided multi-page camera scan: tips → photo → AI readability check → pages tray → one merged PDF. */
export function ScanFlow({ category, disabled, onUploaded }: { category: string; disabled: boolean; onUploaded: () => void }) {
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pages, setPages] = useState<Page[]>([]);
  const [reason, setReason] = useState("");

  const shoot = async () => {
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (r.canceled || !r.assets?.[0]) {
      setPhase("idle");
      return;
    }
    const a = r.assets[0];
    const page: Page = { uri: a.uri, name: a.fileName || `page_${pages.length + 1}.jpg`, type: a.mimeType || "image/jpeg", file: (a as any).file };
    setPhase("checking");
    try {
      const form = new FormData();
      await appendFile(form, "file", page);
      const res = await post("/documents/scan-check", form);
      if (!res.readable) {
        setReason(res.reason || t("scanUnreadable"));
        setPhase("rejected");
        return;
      }
      setPages((p) => [...p, page]);
      setPhase("idle");
    } catch (e: any) {
      toast(e.message, "error");
      setPhase("idle");
    }
  };

  const capture = async () => {
    const perm = await ImagePicker.getCameraPermissionsAsync();
    if (perm.granted) return shoot();
    if (!perm.canAskAgain) return setPhase("blocked");
    setPhase("explain");
  };

  const requestCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) return shoot();
    setPhase(perm.canAskAgain ? "idle" : "blocked");
    if (perm.canAskAgain) toast(t("camDenied"), "error");
  };

  const send = async () => {
    setPhase("uploading");
    try {
      const form = new FormData();
      for (const p of pages) await appendFile(form, "files", p);
      form.append("category", category);
      await post("/documents/scan", form);
      toast(t("docUploaded"));
      setPages([]);
      onUploaded();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setPhase("idle");
    }
  };

  const start = () => (pages.length ? capture() : setPhase("tips"));
  const busy = phase === "checking" || phase === "uploading";

  return (
    <View style={{ gap: 10 }}>
      {pages.length === 0 && phase !== "tips" && (
        <Pressable testID="document-camera-button" onPress={start} disabled={disabled || busy} style={({ pressed }) => [styles.camBtn, pressed && { opacity: 0.85 }]}>
          {busy ? <ActivityIndicator color={colors.brandPrimary} /> : <Ionicons name="camera-outline" size={20} color={colors.brandPrimary} />}
          <Text style={styles.camText}>{phase === "checking" ? t("scanChecking") : t("scanCamera")}</Text>
        </Pressable>
      )}

      {phase === "tips" && (
        <Animated.View entering={FadeInDown.duration(250)} style={styles.card} testID="scan-tips">
          <Text style={styles.cardTitle}>{t("scanTipsTitle")}</Text>
          {TIPS.map(([icon, key]) => (
            <View key={key} style={styles.tip}>
              <View style={styles.tipIcon}><Ionicons name={icon} size={16} color={colors.brandPrimary} /></View>
              <Text style={styles.tipText}>{t(key)}</Text>
            </View>
          ))}
          <View style={styles.row}>
            <Pressable testID="scan-tips-cancel" onPress={() => setPhase("idle")} style={styles.secondary}><Text style={styles.secondaryText}>{t("cancel")}</Text></Pressable>
            <Pressable testID="scan-take-photo" onPress={capture} style={[styles.primary, { flex: 1 }]}>
              <Ionicons name="camera" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.primaryText}>{t("scanTake")}</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {phase === "explain" && (
        <View style={styles.card} testID="camera-permission-explain">
          <Text style={styles.tipText}>{t("camExplain")}</Text>
          <Pressable testID="camera-permission-continue" onPress={requestCamera} style={styles.primary}><Text style={styles.primaryText}>{t("continue")}</Text></Pressable>
        </View>
      )}
      {phase === "blocked" && (
        <View style={styles.card} testID="camera-permission-blocked">
          <Text style={styles.tipText}>{t("camBlocked")}</Text>
          <Pressable testID="camera-open-settings" onPress={() => Linking.openSettings()} style={styles.primary}><Text style={styles.primaryText}>{t("openSettings")}</Text></Pressable>
        </View>
      )}

      {phase === "rejected" && (
        <Animated.View entering={FadeInDown.duration(250)} style={[styles.card, styles.reject]} testID="scan-rejected">
          <View style={styles.tip}>
            <Ionicons name="alert-circle" size={20} color={colors.error} />
            <Text style={[styles.cardTitle, { color: colors.error, flex: 1 }]}>{t("scanUnreadable")}</Text>
          </View>
          <Text style={styles.tipText} testID="scan-rejected-reason">{reason}</Text>
          <View style={styles.row}>
            <Pressable testID="scan-rejected-cancel" onPress={() => setPhase("idle")} style={styles.secondary}><Text style={styles.secondaryText}>{t("cancel")}</Text></Pressable>
            <Pressable testID="scan-retake" onPress={capture} style={[styles.primary, { flex: 1 }]}>
              <Ionicons name="refresh" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.primaryText}>{t("scanRetake")}</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {pages.length > 0 && (
        <View style={styles.card} testID="scan-tray">
          <Text style={styles.cardTitle}>{t("scanPages", { n: String(pages.length) })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {pages.map((p, i) => (
              <View key={p.uri + i} style={styles.thumb} testID={`scan-page-${i}`}>
                <Image source={{ uri: p.uri }} style={styles.thumbImg} contentFit="cover" />
                <Text style={styles.thumbNo}>{i + 1}</Text>
                <Pressable testID={`scan-page-remove-${i}`} onPress={() => setPages((ps) => ps.filter((_, k) => k !== i))} hitSlop={8} style={styles.thumbX}>
                  <Ionicons name="close" size={14} color={colors.onSurfaceInverse} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <View style={styles.row}>
            <Pressable testID="scan-add-page" onPress={capture} disabled={busy || pages.length >= MAX_PAGES} style={[styles.secondary, { flex: 1 }]}>
              {phase === "checking" ? <ActivityIndicator color={colors.brandPrimary} /> : <Ionicons name="add" size={18} color={colors.brandPrimary} />}
              <Text style={styles.secondaryText}>{phase === "checking" ? t("scanChecking") : t("scanAddPage")}</Text>
            </Pressable>
            <Pressable testID="scan-finish" onPress={send} disabled={busy} style={[styles.primary, { flex: 1 }]}>
              {phase === "uploading" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="cloud-upload" size={18} color={colors.onBrandPrimary} />}
              <Text style={styles.primaryText}>{t("scanFinish")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  camBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.brandPrimary, backgroundColor: c.brandPrimarySoft },
  camText: { color: c.brandPrimary, fontWeight: "800", fontSize: 14 },
  card: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: c.brandPrimarySoft, borderWidth: 1, borderColor: c.border },
  reject: { backgroundColor: c.surfaceSecondary, borderColor: c.error },
  cardTitle: { color: c.onSurface, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  tip: { flexDirection: "row", alignItems: "center", gap: 10 },
  tipIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  tipText: { flex: 1, color: c.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", gap: 8 },
  primary: { minHeight: 46, borderRadius: 12, backgroundColor: c.brandPrimary, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  primaryText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  secondary: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  secondaryText: { color: c.brandPrimary, fontWeight: "700", fontSize: 13 },
  thumb: { width: 64, height: 86, borderRadius: 8, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  thumbImg: { width: "100%", height: "100%" },
  thumbNo: { position: "absolute", bottom: 4, left: 6, color: c.onSurfaceInverse, fontWeight: "900", fontSize: 12, textShadowColor: "#000", textShadowRadius: 3 },
  thumbX: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
}));
