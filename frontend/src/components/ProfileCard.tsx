// Profile dashboard card ("Karta ask Elon"): four tiles from existing user fields.
//   ≥ 600 px wide: 2 × 2 grid  [personal | employer] / [contact | employment]
//   phones:        one column in reading order  personal → employer → employment → contact
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { useAuth } from "@/src/auth";
import { withBrand } from "@/src/components/BrandName";
import { LANG_FLAGS } from "@/src/components/LanguageSwitch";
import { useToast } from "@/src/components/Toast";
import { formatDate, formatEmploymentLength } from "@/src/format";
import { useT } from "@/src/i18n";
import { fx, makeStyles, useTheme } from "@/src/theme";

/** Below this window width the tiles stack in one column (360/390 px phones). */
export const PROFILE_GRID_MIN_WIDTH = 600;

/** "Anna Maria Testowa" -> ["Anna Maria", "Testowa"]; one word -> [word, ""]. Display only, the DB keeps one `name`. */
export function splitName(name: string | undefined | null): [string, string] {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [parts[0] ?? "", ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

export function ProfileCard({ proOn }: { proOn: boolean }) {
  const { user, locale } = useAuth();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= PROFILE_GRID_MIN_WIDTH;

  const [first, last] = splitName(user?.name);
  const initials = (user?.name || user?.email || "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const accountId = user?.user_id ? `AE-${user.user_id.slice(-6).toUpperCase()}` : "";
  const createdAt = (user as any)?.created_at as string | undefined;
  const service = formatEmploymentLength(user?.start_date, locale);
  const since = formatDate(user?.start_date, locale);

  const copyId = async () => {
    if (!accountId) return;
    try {
      await Clipboard.setStringAsync(accountId);
      toast(t("pfIdCopied"));
    } catch {}
  };

  const field = (label: string, value: ReactNode, opts: { half?: boolean; testID?: string; lines?: number } = {}) => (
    <View style={[styles.field, opts.half && styles.fieldHalf]} testID={opts.testID}>
      <Text style={styles.fLabel} numberOfLines={1}>{label}</Text>
      {typeof value === "string" || value == null ? (
        <Text style={styles.fVal} numberOfLines={opts.lines ?? 2}>{value || "—"}</Text>
      ) : value}
    </View>
  );

  const tile = (icon: any, title: string, children: ReactNode, testID: string, accent = false) => (
    <View style={[styles.tile, wide && styles.tileWide, accent && styles.tileAccent]} testID={testID}>
      <View style={styles.tileHead}>
        <View style={styles.tileIcon}><Ionicons name={icon} size={15} color={colors.askOrange} /></View>
        <Text style={styles.tileTitle} numberOfLines={1}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );

  const personal = tile("person", t("secPersonal"), (
    <>
      <View style={styles.personRow}>
        {user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatar} testID="profile-avatar" accessibilityLabel={user?.name} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]} testID="profile-avatar-initials"><Text style={styles.initials}>{initials}</Text></View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View testID="profile-first-name">
            <Text style={styles.fLabel} numberOfLines={1}>{t("pfFirstName")}</Text>
            <Text style={styles.nameVal} numberOfLines={2} testID="profile-name">{first || "—"}</Text>
          </View>
          <View testID="profile-surname">
            <Text style={styles.fLabel} numberOfLines={1}>{t("pfSurname")}</Text>
            <Text style={styles.nameVal} numberOfLines={2}>{last || "—"}</Text>
          </View>
        </View>
      </View>
      <View style={styles.fields}>
        {field(t("pfLanguage"), `${LANG_FLAGS[locale]} ${t("langName")}`, { half: true, testID: "profile-card-language" })}
        {field(t("pfStatus"), (
          <View style={styles.badges}>
            {proOn ? (
              <View style={[styles.badge, styles.badgePro, fx("chipProGlow")]} testID="profile-member-badge"><Text style={styles.badgeProText} numberOfLines={1}>★ {t("proActive")}</Text></View>
            ) : (
              <View style={[styles.badge, styles.badgeGlass]} testID="profile-no-sub-badge"><Text style={styles.badgeText} numberOfLines={1}>{t("noSubscription")}</Text></View>
            )}
            {user?.role === "admin" && (
              <View style={[styles.badge, styles.badgeGlass]} testID="profile-admin-badge"><Text style={styles.badgeText}>{t("pfAdmin")}</Text></View>
            )}
          </View>
        ), { half: true, testID: "profile-card-status" })}
        {field(t("accountId"), (
          <Pressable onPress={copyId} accessibilityRole="button" accessibilityLabel={`${t("accountId")} ${accountId}. ${t("pfCopyId")}`} testID="profile-account-id-copy"
            style={({ pressed }) => [styles.idRow, pressed && { opacity: 0.75 }]} hitSlop={6}>
            <Text style={styles.idVal} testID="profile-account-id" selectable>{accountId}</Text>
            <Ionicons name="copy-outline" size={15} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </>
  ), "profile-card-personal");

  const employer = tile("business", t("cardEmployer"), user?.employer ? (
    <>
      <Text style={styles.bigVal} numberOfLines={2} ellipsizeMode="tail" testID="profile-card-employer-name">{user.employer}</Text>
      <View style={styles.fields}>
        {!!user.industry && field(t("industry"), user.industry, { half: true, testID: "profile-card-industry" })}
        {!!user.job_title && field(t("pfJobTitle"), user.job_title, { half: true })}
        {!!user.contract_type && field(t("contractType"), t(`ct_${user.contract_type}` as any), { half: true })}
        {!!user.employer_company_number && field(t("pfCompanyNo"), user.employer_company_number, { half: true, testID: "profile-card-company-number" })}
        {!!user.workplace_address && field(t("pfWorkplace"), user.workplace_address, { lines: 3 })}
        {!!user.hr_email && field(t("pfHrEmail"), user.hr_email, { lines: 1 })}
      </View>
    </>
  ) : (
    <Text style={styles.empty} testID="profile-card-employer-empty">{t("pfNoEmployer")}</Text>
  ), "profile-card-employer");

  const employment = tile("ribbon", t("pfEmployment"), user?.start_date && service ? (
    <View style={styles.fields}>
      {field(t("pfCompany"), user?.employer || "—", { testID: "profile-card-company" })}
      {field(t("pfSince"), since, { half: true, testID: "profile-card-since" })}
      {field(t("cardService"), (
        <Text style={styles.serviceVal} numberOfLines={2} testID="profile-card-service-value">{service}</Text>
      ), { half: true, testID: "profile-card-service" })}
    </View>
  ) : (
    <Text style={styles.empty} testID="profile-card-employment-empty">{t("pfNoStart")}</Text>
  ), "profile-card-employment", true);

  const contact = tile("mail", t("pfContact"), (
    <View style={styles.fields}>
      {field(t("pfEmail"), user?.email, { lines: 2, testID: "profile-email" })}
      {field(t("pfPhone"), user?.phone, { half: true })}
      {field(t("accountSince"), createdAt ? formatDate(createdAt, locale) : "", { half: true })}
      {!!user?.address && field(t("homeAddress"), user.address, { lines: 3 })}
    </View>
  ), "profile-card-contact");

  return (
    <View style={[styles.cardOuter, fx("profileCardGlow")]} testID="profile-card">
      <LinearGradient colors={[colors.surfaceSecondary, colors.brand, colors.surfaceSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
        <View style={styles.cardStripe} />
        <Image source={require("@/assets/brand/robot-watermark.png")} style={styles.watermark} contentFit="contain" accessible={false} alt="" />
        <View style={styles.cardTop}>
          <Text style={styles.cardKicker} numberOfLines={1}>{withBrand(t("profileCard"), "soft", (s) => s.toUpperCase())}</Text>
          <Text style={styles.cardTag} numberOfLines={1}>{t("profileCardTag").toUpperCase()}</Text>
        </View>
        {wide ? (
          <View style={styles.grid} testID="profile-card-grid">
            <View style={styles.row}>{personal}{employer}</View>
            <View style={styles.row}>{contact}{employment}</View>
          </View>
        ) : (
          <View style={styles.stack} testID="profile-card-stack">{personal}{employer}{employment}{contact}</View>
        )}
      </LinearGradient>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  cardOuter: { margin: 16, marginBottom: 0, borderRadius: 20 },
  cardBg: { borderRadius: 20, padding: 14, paddingLeft: 20, overflow: "hidden", gap: 12, borderWidth: 1, borderColor: c.border },
  cardStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6, backgroundColor: c.askOrange },
  watermark: { position: "absolute", right: -34, bottom: -34, width: 150, height: 150, opacity: 0.1 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingHorizontal: 2 },
  cardKicker: { color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, flexShrink: 1 },
  cardTag: { color: c.askOrange, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, flexShrink: 0 },
  grid: { gap: 12 },
  row: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  stack: { gap: 10 },
  tile: { padding: 12, borderRadius: 14, backgroundColor: c.glassFill, borderWidth: 1, borderColor: c.border, gap: 10 },
  tileWide: { flex: 1, minWidth: 0, padding: 16 },
  tileAccent: { backgroundColor: c.askOrangeTint, borderColor: c.heritageOrangeSoft },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tileIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tileTitle: { color: c.askOrange, fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2, flexShrink: 1 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, borderColor: c.onBrandPrimary, flexShrink: 0 },
  avatarFallback: { backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center" },
  initials: { color: c.onAccent, fontSize: 20, fontWeight: "900" },
  nameVal: { color: c.onSurface, fontSize: 16.5, fontWeight: "800", marginTop: 1 },
  fields: { flexDirection: "row", flexWrap: "wrap", rowGap: 10, columnGap: 0 },
  field: { width: "100%", paddingRight: 8, minWidth: 0 },
  fieldHalf: { width: "50%" },
  fLabel: { color: c.muted, fontSize: 11, fontWeight: "700" },
  fVal: { color: c.onSurface, fontSize: 14, fontWeight: "700", marginTop: 2 },
  bigVal: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  serviceVal: { color: c.askOrange, fontSize: 16, fontWeight: "900", marginTop: 2 },
  empty: { color: c.footnote, fontSize: 13, lineHeight: 19 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 },
  badge: { height: 24, borderRadius: 999, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  badgePro: { backgroundColor: c.askOrange },
  badgeProText: { color: c.onAccent, fontSize: 11.5, fontWeight: "800" },
  badgeGlass: { backgroundColor: c.glassFill, borderWidth: 1, borderColor: c.glassBorder },
  badgeText: { color: c.onBrandPrimary, fontSize: 11.5, fontWeight: "700" },
  idRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, alignSelf: "flex-start", minHeight: 24 },
  idVal: { color: c.onSurface, fontSize: 14.5, fontWeight: "800", letterSpacing: 1 },
}));
