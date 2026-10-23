import Ionicons from "@react-native-vector-icons/ionicons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";

import { useT } from "@/src/i18n";
import { Business, companyByNumber, isCompanyNumber, isUkPostcode, lookupConfig, lookupErrorKey, nearbyBusinesses } from "@/src/lookup";
import { fx, makeStyles, useTheme } from "@/src/theme";

export type LookupPick = { name: string; address: string; company_number?: string; registered_office?: boolean };

/**
 * Employer finder: UK postcode -> list of nearby businesses (OpenStreetMap) -> tap fills name + address;
 * or a Companies House number -> registered office address. Manual typing in the form always stays possible.
 */
export function EmployerLookup({ onPick, initialPostcode = "", compact = false, hideTitle = false, testID = "employer-lookup" }:
  { onPick: (p: LookupPick) => void; initialPostcode?: string; compact?: boolean; hideTitle?: boolean; testID?: string }) {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  const [pc, setPc] = useState(initialPostcode);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Business[] | null>(null);
  const [resPc, setResPc] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [cfg, setCfg] = useState<{ company_number: boolean } | null>(null);
  const [cn, setCn] = useState("");
  const [cnBusy, setCnBusy] = useState(false);
  const [cnErr, setCnErr] = useState<string | null>(null);
  const [cnNote, setCnNote] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    lookupConfig().then(setCfg).catch(() => setCfg({ company_number: false }));
  }, []);

  const search = async () => {
    const v = pc.trim();
    setPicked(null);
    if (!isUkPostcode(v)) {
      setResults(null);
      setErr(t("lk_errInvalidPc"));
      return;
    }
    const my = ++seq.current;
    setBusy(true);
    setErr(null);
    try {
      const r = await nearbyBusinesses(v, q);
      if (my !== seq.current) return;
      setResPc(r.postcode.postcode);
      setResults(r.results);
      if (!r.results.length) setErr(t("lk_errNone"));
    } catch (e) {
      if (my !== seq.current) return;
      setResults(null);
      setErr(t(lookupErrorKey(e)));
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  const pick = (b: Business) => {
    setPicked(b.id);
    onPick({ name: b.name, address: b.address });
  };

  const fillCompany = async () => {
    setCnErr(null);
    setCnNote(null);
    if (!isCompanyNumber(cn)) {
      setCnErr(t("lk_errCompanyInvalid"));
      return;
    }
    setCnBusy(true);
    try {
      const c = await companyByNumber(cn);
      onPick({ name: c.name, address: c.address, company_number: c.company_number, registered_office: true });
      setCnNote(`${c.name}${c.status && c.status !== "active" ? ` · ${t("lk_dissolved")}` : ""}`);
    } catch (e) {
      const k = lookupErrorKey(e);
      if (k === "lk_companyOff") setCfg({ company_number: false });
      else setCnErr(t(k));
    } finally {
      setCnBusy(false);
    }
  };

  const companyOn = !!cfg?.company_number;

  return (
    <View style={[styles.box, compact && styles.boxCompact]} testID={testID}>
      {!hideTitle && (
        <View style={styles.head}>
          <Ionicons name="search" size={16} color={colors.askOrange} />
          <Text style={styles.title}>{t("lk_title")}</Text>
        </View>
      )}
      {!compact && <Text style={styles.hint}>{t("lk_hint")}</Text>}

      <Text style={styles.label}>{t("lk_postcode")}</Text>
      <View style={styles.row}>
        <View style={[styles.field, styles.pcField, focus === "pc" && styles.fieldFocus, focus === "pc" && fx("focusRing")]}>
          <Ionicons name="location-outline" size={18} color={colors.brandPrimaryText} />
          <TextInput
            testID={`${testID}-postcode-input`}
            value={pc}
            onChangeText={(v) => { setPc(v.toUpperCase()); setErr(null); }}
            placeholder="PE1 1XX"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="postal-code"
            maxLength={9}
            returnKeyType="search"
            onSubmitEditing={search}
            onFocus={() => setFocus("pc")}
            onBlur={() => setFocus(null)}
            style={[styles.input, webNoOutline]}
          />
        </View>
        <Pressable testID={`${testID}-search-button`} onPress={search} disabled={busy} accessibilityRole="button"
          style={({ pressed }) => [styles.btn, (busy || !pc.trim()) && { opacity: 0.6 }, pressed && fx("glowOrange")]}>
          {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.btnText}>{t("lk_search")}</Text>}
        </Pressable>
      </View>
      <View style={[styles.field, focus === "q" && styles.fieldFocus]}>
        <Ionicons name="funnel-outline" size={16} color={colors.muted} />
        <TextInput
          testID={`${testID}-filter-input`}
          value={q}
          onChangeText={setQ}
          placeholder={t("lk_filter")}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          onSubmitEditing={search}
          onFocus={() => setFocus("q")}
          onBlur={() => setFocus(null)}
          style={[styles.input, styles.inputSm, webNoOutline]}
        />
      </View>

      {!!err && (
        <View style={styles.errBox} testID={`${testID}-error`}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={styles.errText}>{err}</Text>
        </View>
      )}

      {!!results?.length && (
        <View style={{ gap: 6 }} testID={`${testID}-results`}>
          <Text style={styles.resHead}>{t("lk_results", { pc: resPc })}</Text>
          <Text style={styles.resHint}>{t("lk_pickHint")}</Text>
          <View style={styles.list}>
            {results.slice(0, 25).map((b, i) => {
              const on = picked === b.id;
              return (
                <Pressable key={b.id + i} testID={`${testID}-result-${i}`} onPress={() => pick(b)} accessibilityRole="button"
                  style={({ pressed }) => [styles.item, i > 0 && styles.itemSep, on && styles.itemOn, pressed && { opacity: 0.85 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{b.name}</Text>
                    <Text style={styles.itemAddr} numberOfLines={2}>{b.address}</Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {kindLabel(b.kind)}{b.distance_m != null ? ` · ${b.distance_m < 1000 ? `${b.distance_m} m` : `${(b.distance_m / 1000).toFixed(1)} km`}` : ""}
                      {b.postcode_guessed ? ` · ${t("lk_pcGuessed")}` : ""}
                    </Text>
                  </View>
                  <Ionicons name={on ? "checkmark-circle" : "add-circle-outline"} size={22} color={on ? colors.success : colors.askOrange} />
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.attr}>{t("lk_osm")}</Text>
        </View>
      )}

      <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>{t("lk_or")}</Text><View style={styles.orLine} /></View>

      <Text style={[styles.label, !companyOn && styles.labelOff]}>{t("lk_company")}</Text>
      <View style={styles.row}>
        <View style={[styles.field, styles.pcField, !companyOn && styles.fieldOff, focus === "cn" && styles.fieldFocus]}>
          <Ionicons name="business-outline" size={18} color={companyOn ? colors.brandPrimaryText : colors.muted} />
          <TextInput
            testID={`${testID}-company-input`}
            value={cn}
            editable={companyOn}
            onChangeText={(v) => { setCn(v.toUpperCase()); setCnErr(null); }}
            placeholder={t("lk_companyPh")}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            onSubmitEditing={fillCompany}
            onFocus={() => setFocus("cn")}
            onBlur={() => setFocus(null)}
            style={[styles.input, webNoOutline]}
          />
        </View>
        <Pressable testID={`${testID}-company-button`} onPress={fillCompany} disabled={!companyOn || cnBusy} accessibilityRole="button"
          accessibilityState={{ disabled: !companyOn }} style={[styles.btnGhost, !companyOn && styles.btnOff]}>
          {cnBusy ? <ActivityIndicator size="small" color={colors.askOrange} /> : <Text style={[styles.btnGhostText, !companyOn && styles.btnOffText]}>{t("lk_companyFill")}</Text>}
        </Pressable>
      </View>
      {cfg && !companyOn && <Text style={styles.note} testID={`${testID}-company-off`}>{t("lk_companyOff")}</Text>}
      {!!cnErr && <Text style={styles.errText} testID={`${testID}-company-error`}>{cnErr}</Text>}
      {!!cnNote && (
        <View style={styles.okBox} testID={`${testID}-company-ok`}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.okText}>{cnNote}{"\n"}<Text style={styles.note}>{t("lk_companyNote")}</Text></Text>
        </View>
      )}
    </View>
  );
}

const kindLabel = (k: string) => { const s = (k || "").replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };

const webNoOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null;

const useStyles = makeStyles((c) => ({
  box: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderLeftWidth: 3, borderLeftColor: c.askOrange },
  boxCompact: { padding: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: c.onSurface, fontSize: 14, fontWeight: "800" },
  hint: { color: c.muted, fontSize: 12, lineHeight: 17 },
  label: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  labelOff: { opacity: 0.6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.askField, borderWidth: 1, borderColor: c.borderStrong },
  pcField: { flex: 1, minWidth: 0 },
  fieldFocus: { borderColor: c.askOrange },
  fieldOff: { opacity: 0.55 },
  input: { flex: 1, minWidth: 0, fontSize: 15, color: c.onSurface, paddingVertical: 8 },
  inputSm: { fontSize: 14 },
  btn: { minHeight: 44, minWidth: 84, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  btnText: { color: c.onAccent, fontWeight: "800", fontSize: 14 },
  btnGhost: { minHeight: 44, minWidth: 84, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.askOrange, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  btnGhostText: { color: c.askOrange, fontWeight: "800", fontSize: 13 },
  btnOff: { borderColor: c.borderStrong },
  btnOffText: { color: c.muted },
  errBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", padding: 10, borderRadius: 10, backgroundColor: c.errorSoft },
  errText: { flex: 1, color: c.error, fontSize: 12.5, fontWeight: "600", lineHeight: 17 },
  okBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", padding: 10, borderRadius: 10, backgroundColor: c.successSoft },
  okText: { flex: 1, color: c.onSurface, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  resHead: { color: c.onSurface, fontSize: 13, fontWeight: "800", marginTop: 4 },
  resHint: { color: c.muted, fontSize: 12 },
  list: { borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, overflow: "hidden", maxHeight: 360, ...(Platform.OS === "web" ? ({ overflowY: "auto" } as any) : null) },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9, minHeight: 56 },
  itemSep: { borderTopWidth: 1, borderTopColor: c.divider },
  itemOn: { backgroundColor: c.askOrangeTint },
  itemName: { color: c.onSurface, fontSize: 14, fontWeight: "800" },
  itemAddr: { color: c.onSurfaceTertiary, fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  itemMeta: { color: c.footnote, fontSize: 11, marginTop: 2 },
  attr: { color: c.footnote, fontSize: 10.5, textAlign: "right" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: c.divider },
  orText: { color: c.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  note: { color: c.muted, fontSize: 12, lineHeight: 17, fontWeight: "500" },
}));
