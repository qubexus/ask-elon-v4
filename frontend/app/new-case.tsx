import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { FocusTextInput } from "@/src/components/Brand";
import { fx, makeStyles, useTheme } from "@/src/theme";

export default function NewCase() {
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const c = await api("/cases", { method: "POST", body: { title, description, sector } });
      router.replace(`/case/${c.case_id}`);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="new-case-screen">
      <View style={[styles.head, { paddingTop: insets.top > 30 ? 16 : insets.top + 16 }]}>
        <Text style={styles.title}>{t("newCase")}</Text>
        <Pressable testID="new-case-close-button" onPress={() => router.back()} hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t("caseTitle")}</Text>
        <FocusTextInput testID="new-case-title-input" value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={colors.muted} placeholder="Unpaid overtime" />
        <Text style={styles.label}>{t("sector")}</Text>
        <FocusTextInput testID="new-case-sector-input" value={sector} onChangeText={setSector} style={styles.input} placeholderTextColor={colors.muted} placeholder="Amazon LCY2" />
        <Text style={styles.label}>{t("caseDesc")}</Text>
        <FocusTextInput testID="new-case-description-input" value={description} onChangeText={setDescription} style={[styles.input, styles.area]} multiline textAlignVertical="top" />
        <Pressable testID="new-case-submit-button" onPress={submit} disabled={!title.trim() || busy} style={[styles.cta, (!title.trim() || busy) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>{t("create")}</Text>}
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
  label: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700", marginTop: 8 },
  input: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: 15, color: c.onSurface },
  area: { minHeight: 140, paddingTop: 12 },
  cta: { minHeight: 52, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: 24, ...fx("buttonShadow") },
  ctaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 15 },
}));
