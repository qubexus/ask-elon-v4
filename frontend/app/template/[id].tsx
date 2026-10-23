import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ProLock } from "@/src/components/ProLock";
import { usePro } from "@/src/revenuecat";
import { Header } from "@/src/components/Header";
import { useToast } from "@/src/components/Toast";
import { localeSuffix, templateTitle, useT } from "@/src/i18n";
import { getTemplates, LegalTemplate, renderLetter } from "@/src/templates";
import { fx, makeStyles, useTheme } from "@/src/theme";

export default function TemplateForm() {
  const { id, from_audit, ...auditVals } = useLocalSearchParams<{ id: string; from_audit?: string; amount_owed?: string; pay_period?: string; hours_worked?: string }>();
  const { user, locale } = useAuth();
  const sfx = localeSuffix(locale);
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tpl, setTpl] = useState<LegalTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const isPro = usePro();
  const [stepState, setStep] = useState<"form" | "preview">("form");
  const step = isPro ? stepState : "preview";

  useEffect(() => {
    getTemplates().then((all) => {
      const found = all.find((x) => x.id === id) ?? null;
      setTpl(found);
      if (found) {
        const prefill: Record<string, string> = {
          employee_name: user?.name ?? "",
          employer_name: user?.employer ?? "",
          job_title: user?.job_title ?? "",
          ...(from_audit ? (auditVals as Record<string, string>) : {}),
        };
        const v: Record<string, string> = {};
        for (const f of found.fields) v[f.key] = prefill[f.key] || f.defaultValue;
        setValues(v);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, from_audit]);

  const letter = useMemo(() => (tpl ? renderLetter(tpl, values) : ""), [tpl, values]);

  if (!tpl) {
    return (
      <View style={styles.root}>
        <Header back title="" />
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      </View>
    );
  }

  const copy = async () => {
    await Clipboard.setStringAsync(letter);
    toast(t("copied"));
  };

  const sendToHr = async () => {
    const to = user?.hr_email?.trim() ?? "";
    if (!to) toast(t("sendHrNoEmail"));
    const subject = letter.split("\n").find((l) => l.startsWith("SUBJECT:"))?.replace("SUBJECT:", "").trim() || (tpl as any).titleEn;
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(letter)}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast(t("mailError"), "error");
      return;
    }
    try {
      const amount = parseFloat(values.amount_owed ?? "");
      await api("/letters", { method: "POST", body: { template_id: tpl.id, title: (tpl as any)[`title${sfx}`], recipient: to, amount_gbp: Number.isFinite(amount) ? amount : null } });
      toast(t("letterTracked"));
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={styles.root} testID="template-screen">
      <Header back title={templateTitle(locale, tpl)} subtitle={tpl.statutoryReference} />
      {isPro && (
      <View style={styles.steps}>
        {(["form", "preview"] as const).map((s) => (
          <Pressable key={s} testID={`template-step-${s}`} onPress={() => setStep(s)} style={[styles.step, step === s && styles.stepActive]}>
            <Text style={[styles.stepText, step === s && styles.stepTextActive]}>{s === "form" ? t("fields") : t("preview")}</Text>
          </Pressable>
        ))}
      </View>
      )}
      {step === "form" ? (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.desc}>{(tpl as any)[`description${sfx}`]}</Text>
          {!!from_audit && (
            <View style={styles.auditBanner} testID="template-audit-prefill">
              <Ionicons name="sparkles" size={16} color={colors.success} />
              <Text style={styles.auditBannerText}>{t("auditPrefilled")}</Text>
            </View>
          )}
          {tpl.fields.map((f) => (
            <View key={f.key} style={{ gap: 6 }}>
              <Text style={styles.label}>{(f as any)[`label${sfx}`]}</Text>
              <TextInput
                testID={`template-field-${f.key}`}
                value={values[f.key] ?? ""}
                onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                placeholder={f.placeholder}
                placeholderTextColor={colors.muted}
                multiline
                style={styles.input}
              />
            </View>
          ))}
          <Pressable testID="template-generate-button" onPress={() => setStep("preview")} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
            <Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.ctaText}>{t("generate")}</Text>
          </Pressable>
        </KeyboardAwareScrollView>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.paper}>
              <Text selectable={isPro} style={styles.letter} testID="template-letter-preview">{letter}</Text>
            </View>
          </ScrollView>
          {!isPro ? (
            <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
              <View style={{ flex: 1 }}><ProLock testID="template-pro-lock" text={t("freeTemplates")} /></View>
            </View>
          ) : (
          <>
          <View style={[styles.footer, { paddingBottom: 8 }]}>
            <Pressable testID="template-send-hr-button" onPress={sendToHr} style={[styles.cta, styles.hrBtn]}>
              <Ionicons name="mail" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>{t("sendHr")}</Text>
            </Pressable>
          </View>
          <View style={[styles.footer, { paddingTop: 0, borderTopWidth: 0, paddingBottom: insets.bottom + 16 }]}>
            <Pressable testID="template-copy-button" onPress={copy} style={styles.secondary}>
              <Ionicons name="copy-outline" size={18} color={colors.brandPrimary} />
              <Text style={styles.secondaryText}>{t("copy")}</Text>
            </Pressable>
            <Pressable testID="template-share-button" onPress={() => Share.share({ message: letter })} style={[styles.cta, { flex: 1, marginTop: 0 }]}>
              <Ionicons name="share-outline" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>{t("share")}</Text>
            </Pressable>
          </View>
          </>
          )}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  steps: { flexDirection: "row", margin: 16, marginBottom: 0, backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 4, gap: 4 },
  step: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  stepActive: { backgroundColor: c.surfaceSecondary },
  stepText: { color: c.muted, fontWeight: "600", fontSize: 14 },
  stepTextActive: { color: c.brandPrimary },
  body: { padding: 16, gap: 16 },
  desc: { color: c.muted, fontSize: 14, lineHeight: 20 },
  auditBanner: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: c.successSoft, borderRadius: 12, padding: 12 },
  hrBtn: { flex: 1, marginTop: 0, backgroundColor: c.heritageOrange },
  auditBannerText: { flex: 1, color: c.onSurface, fontSize: 13, fontWeight: "600" },
  label: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  input: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontSize: 15, color: c.onSurface },
  cta: { minHeight: 52, borderRadius: 12, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, ...fx("buttonShadow") },
  ctaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 15 },
  paper: { backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: c.border },
  letter: { color: c.onSurface, fontSize: 13, lineHeight: 20, fontFamily: "Georgia" },
  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  secondary: { minHeight: 52, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1.5, borderColor: c.brandPrimary, backgroundColor: "transparent", flexDirection: "row", alignItems: "center", gap: 8 },
  secondaryText: { color: c.brandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 14 },
}));
