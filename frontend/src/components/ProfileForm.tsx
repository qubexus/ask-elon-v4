import Ionicons from "@react-native-vector-icons/ionicons";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "@/src/api";
import { useAuth, User } from "@/src/auth";
import { EmployerLookup, LookupPick } from "@/src/components/EmployerLookup";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { fx, makeStyles, useTheme } from "@/src/theme";

export const CONTRACT_TYPES = ["permanent", "fixed_term", "zero_hours", "agency", "contract_for_services", "b2b"] as const;
export const INDUSTRIES = ["Logistics & Warehousing", "Manufacturing", "Food Production", "Transport & Haulage", "Retail", "Hospitality", "Construction", "Healthcare & Care", "Cleaning"];

type Key = "name" | "address" | "phone" | "employer" | "industry" | "job_title" | "contract_type" | "start_date" | "workplace_address" | "hr_email";
const REQUIRED: Key[] = ["name", "address", "phone", "employer", "industry", "job_title", "contract_type", "start_date", "workplace_address"];

export function ProfileForm({ onSaved, ctaLabel }: { onSaved?: (u: User) => void; ctaLabel?: string }) {
  const { user, setUser } = useAuth();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const init = (k: Key) => ((user as any)?.[k] as string) ?? "";
  const [f, setF] = useState<Record<Key, string>>(() => {
    const o = {} as Record<Key, string>;
    (["name", "address", "phone", "employer", "industry", "job_title", "contract_type", "start_date", "workplace_address", "hr_email"] as Key[]).forEach((k) => (o[k] = init(k)));
    if (!o.phone) o.phone = "+44 ";
    return o;
  });
  const [companyNumber, setCompanyNumber] = useState<string>(((user as any)?.employer_company_number as string) ?? "");
  const [lookupOpen, setLookupOpen] = useState(() => !f0Filled(user));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: Key) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(f.start_date.trim());
  const phoneOk = /^\+\d{1,3}\s?[\d\s]{6,}$/.test(f.phone.trim());
  const hrOk = !f.hr_email.trim() || /^\S+@\S+\.\S+$/.test(f.hr_email.trim());
  const missing = REQUIRED.filter((k) => !f[k].trim() || (k === "phone" && f.phone.trim().length < 6));
  const valid = missing.length === 0 && dateOk && phoneOk && hrOk;

  const save = async () => {
    setTouched(true);
    if (!valid) {
      toast(t("fillRequired"), "error");
      return;
    }
    setSaving(true);
    try {
      const u = await api<User>("/profile", { method: "PUT", body: { ...f, employer_company_number: companyNumber, onboarded: true } });
      setUser(u);
      toast(t("saved"));
      onSaved?.(u);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const onPick = (p: LookupPick) => {
    setF((s) => ({ ...s, employer: p.name || s.employer, workplace_address: p.address || s.workplace_address }));
    setCompanyNumber(p.company_number ?? "");
    toast(t("lk_filled"));
  };

  const [focusKey, setFocusKey] = useState<Key | null>(null);
  const err = (k: Key, extra = true) => touched && (!f[k].trim() || !extra);
  const input = (k: Key, label: string, icon: any, opts: Partial<React.ComponentProps<typeof TextInput>> = {}, required = true, extraOk = true) => (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.req}> *</Text>}
      </Text>
      <View style={[styles.field, required && err(k, extraOk) && styles.fieldErr, focusKey === k && fx("focusRing"), focusKey === k && styles.fieldFocus]}>
        <Ionicons name={icon} size={18} color={colors.brandPrimaryText} />
        <TextInput
          testID={`profile-${k}-input`}
          value={f[k]}
          onChangeText={set(k)}
          placeholderTextColor={colors.muted}
          style={[styles.input, webNoOutline]}
          onFocus={() => setFocusKey(k)}
          onBlur={() => setFocusKey((cur) => (cur === k ? null : cur))}
          {...opts}
        />
      </View>
    </View>
  );

  const chips = (k: Key, options: readonly string[], labelOf: (o: string) => string) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const on = f[k] === o;
        return (
          <Pressable key={o} testID={`profile-${k}-option-${o.replace(/\W+/g, "-").toLowerCase()}`} onPress={() => set(k)(o)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{labelOf(o)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.wrap} testID="profile-form">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("secPersonal")}</Text>
        {input("name", t("name"), "person-outline", { placeholder: "Artur Kowalski", autoComplete: "name" })}
        {input("address", t("homeAddress"), "home-outline", { placeholder: "12 High Street, Dartford DA1 1AA", autoComplete: "street-address" })}
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>{t("email")}<Text style={styles.req}> *</Text></Text>
          <View style={[styles.field, styles.fieldRO]}>
            <Ionicons name="mail-outline" size={18} color={colors.muted} />
            <Text style={styles.ro} testID="profile-email-readonly">{user?.email}</Text>
            <Ionicons name="lock-closed" size={14} color={colors.muted} />
          </View>
        </View>
        {input("phone", t("phone"), "call-outline", { placeholder: "+44 7700 900123", keyboardType: "phone-pad", autoComplete: "tel" }, true, phoneOk)}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("secEmployer")}</Text>
        <Pressable testID="profile-lookup-toggle" onPress={() => setLookupOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: lookupOpen }}
          style={({ pressed }) => [styles.lookupToggle, pressed && { opacity: 0.85 }]}>
          <Ionicons name="search" size={16} color={colors.askOrange} />
          <Text style={styles.lookupToggleText}>{t("lk_title")}</Text>
          <Ionicons name={lookupOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
        </Pressable>
        {lookupOpen && <EmployerLookup hideTitle onPick={onPick} initialPostcode={postcodeIn(f.workplace_address)} testID="profile-lookup" />}
        {input("employer", t("employer"), "business-outline", { placeholder: "Amazon UK Services Ltd" })}
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>{t("industry")}<Text style={styles.req}> *</Text></Text>
          {chips("industry", INDUSTRIES, (o) => o)}
          <View style={[styles.field, err("industry") && styles.fieldErr]}>
            <Ionicons name="layers-outline" size={18} color={colors.muted} />
            <TextInput testID="profile-industry-input" value={f.industry} onChangeText={set("industry")} placeholder={t("industryOther")} placeholderTextColor={colors.muted} style={styles.input} />
          </View>
        </View>
        {input("job_title", t("jobTitle"), "briefcase-outline", { placeholder: "Warehouse Operative" })}
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>{t("contractType")}<Text style={styles.req}> *</Text></Text>
          {chips("contract_type", CONTRACT_TYPES, (o) => t(`ct_${o}` as any))}
          {err("contract_type") && <Text style={styles.errText}>{t("fillRequired")}</Text>}
        </View>
        {input("start_date", t("startDate"), "calendar-outline", { placeholder: "2024-01-12", keyboardType: "numbers-and-punctuation", maxLength: 10 }, true, dateOk)}
        {input("workplace_address", t("workplaceAddress"), "location-outline", { placeholder: "London Road, Tilbury RM18 7AN" })}
        {input("hr_email", t("hrEmail"), "at-outline", { placeholder: "hr@company.co.uk", keyboardType: "email-address", autoCapitalize: "none" }, false, hrOk)}
        {touched && !hrOk && <Text style={styles.errText}>{t("invalidEmail")}</Text>}
      </View>

      {touched && !valid && <Text style={styles.errText} testID="profile-form-error">{t("fillRequired")}</Text>}
      <Pressable testID="profile-save-button" onPress={save} disabled={saving} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
        {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>{ctaLabel ?? t("save")}</Text>}
      </Pressable>
    </View>
  );
}

const PC_IN_TEXT = /\b([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\b/i;
/** First UK postcode found in a free-text address ("London Road, Tilbury RM18 7AN" -> "RM18 7AN"). */
const postcodeIn = (s: string) => (PC_IN_TEXT.exec(s || "")?.[1] ?? "").toUpperCase();
const f0Filled = (u: User | null | undefined) => !!((u as any)?.employer && (u as any)?.workplace_address);

// Web: hide the browser outline; the orange ring sits on the field wrapper.
const webNoOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null;

const useStyles = makeStyles((c) => ({
  wrap: { gap: 16 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: c.border, ...fx("cardShadow") },
  cardTitle: { color: c.brandSecondaryText, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  label: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  req: { color: c.error },
  field: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong },
  fieldFocus: { borderColor: c.askOrange },
  fieldErr: { borderColor: c.error },
  fieldRO: { backgroundColor: c.surfaceTertiary },
  ro: { flex: 1, color: c.onSurfaceTertiary, fontSize: 15 },
  input: { flex: 1, fontSize: 15, color: c.onSurface, paddingVertical: 10 },
  chips: { gap: 8, paddingRight: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexShrink: 0 },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimaryBorder },
  chipText: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: c.onBrandPrimary },
  lookupToggle: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.askOrangeTint },
  lookupToggleText: { flex: 1, color: c.onSurface, fontWeight: "800", fontSize: 14 },
  errText: { color: c.error, fontSize: 12, fontWeight: "600" },
  cta: { minHeight: 50, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", ...fx("buttonShadow") },
  ctaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 14 },
}));
