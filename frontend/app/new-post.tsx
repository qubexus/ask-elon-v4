import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";
import { FORUM_CATS } from "./(tabs)/forum";

export default function NewPost() {
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState("general");
  const [busy, setBusy] = useState(false);
  const ok = title.trim().length >= 3 && body.trim().length >= 3;

  const submit = async () => {
    setBusy(true);
    try {
      const p = await api("/forum/posts", { method: "POST", body: { title, body, category: cat } });
      router.replace(`/forum/${p.post_id}`);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="new-post-screen">
      <View style={[styles.head, { paddingTop: insets.top > 30 ? 16 : insets.top + 16 }]}>
        <Text style={styles.title}>{t("newPost")}</Text>
        <Pressable testID="new-post-close" onPress={() => router.back()} hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FORUM_CATS.map((c) => (
            <Pressable key={c} testID={`new-post-category-${c}`} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipOn]}>
              <Text style={[styles.chipText, cat === c && styles.chipTextOn]}>{t(`fc_${c}` as any)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.label}>{t("postTitle")}</Text>
        <TextInput testID="new-post-title-input" value={title} onChangeText={setTitle} style={styles.input} maxLength={150} />
        <Text style={styles.label}>{t("postBody")}</Text>
        <TextInput testID="new-post-body-input" value={body} onChangeText={setBody} style={[styles.input, styles.area]} multiline textAlignVertical="top" />
        <Pressable testID="new-post-submit" onPress={submit} disabled={!ok || busy} style={[styles.cta, (!ok || busy) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>{t("publish")}</Text>}
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  title: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  body: { padding: 16, gap: 8 },
  chips: { gap: 8, paddingBottom: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  chipOn: { backgroundColor: c.tabForum, borderColor: c.tabForum },
  chipText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: c.onBrandPrimary },
  label: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700", marginTop: 8 },
  input: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: 15, color: c.onSurface },
  area: { minHeight: 160, paddingTop: 12 },
  cta: { minHeight: 52, borderRadius: 12, backgroundColor: c.tabForum, alignItems: "center", justifyContent: "center", marginTop: 24 },
  ctaText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 15, textTransform: "uppercase", letterSpacing: 0.8 },
}));
