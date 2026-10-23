// Profile tab: membership-style "ask Elon" card + two separate sections below it.
//   ProfileCard     navy card (the c4eba96 look): avatar, first name, SURNAME, badges, account ID, QR code.
//                   The QR encodes only the plain account ID, no e-mail or other personal data.
//   ProfileSections "Dane pracodawcy" and "Dane osobowe", two cards side by side from 760 px, else stacked.
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { accountIdOf, formatAccountId } from "@/src/accountId";
import { useAuth } from "@/src/auth";
import { withBrand } from "@/src/components/BrandName";
import { LANG_FLAGS } from "@/src/components/LanguageSwitch";
import { QrCode } from "@/src/components/QrCode";
import { useToast } from "@/src/components/Toast";
import { formatDate, formatEmploymentLength } from "@/src/format";
import { useT } from "@/src/i18n";
import { fx, makeStyles, useTheme } from "@/src/theme";

/** Card never wider than this; ID-1 card proportions (85.6 × 54 mm) as the minimum height. */
export const PROFILE_CARD_MAX_WIDTH = 520;
const CARD_RATIO = 1.586;
/** Sections sit side by side from this window width. */
export const PROFILE_SECTIONS_ROW_MIN_WIDTH = 760;

/** "Anna Maria Testowa" -> ["Anna Maria", "Testowa"]; one word -> [word, ""]. Display only, the DB keeps one `name`. */
export function splitName(name: string | undefined | null): [string, string] {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [parts[0] ?? "", ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

function yearOf(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : String(dt.getFullYear());
}

export function ProfileCard({ proOn }: { proOn: boolean }) {
  const { user, locale } = useAuth();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const cardW = Math.min(width - 32, PROFILE_CARD_MAX_WIDTH);
  const compact = cardW < 350;
  const big = cardW >= 450;
  const qrSize = compact ? 84 : big ? 120 : 104;

  const [first, last] = splitName(user?.name);
  const initials = (user?.name || user?.email || "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const accountId = accountIdOf(user);
  const shownId = formatAccountId(accountId);
  const since = yearOf(user?.created_at);
  // Long surnames shrink to fit one line (web has no adjustsFontSizeToFit): ~0.72 em per bold capital.
  const nameRoom = cardW - (compact ? 34 : 42) - (qrSize + 22) - ((compact ? 46 : big ? 66 : 54) + 12);
  const baseSurname = compact ? 18 : big ? 26 : 21;
  const surnameSize = Math.max(13, Math.min(baseSurname, Math.floor(nameRoom / (Math.max(1, last.length) * 0.74))));

  const copyId = async () => {
    if (!accountId) return;
    try {
      await Clipboard.setStringAsync(accountId);
      toast(t("pfIdCopied"));
    } catch {}
  };

  return (
    <View style={[styles.wrap, { width: cardW }]}>
      <View style={[styles.cardOuter, fx("profileCardGlow")]} testID="profile-card">
        <LinearGradient colors={[colors.surfaceSecondary, colors.brand, colors.surface]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.cardBg, { minHeight: Math.round(cardW / CARD_RATIO) }, compact && styles.cardBgCompact]}>
          <View style={styles.cardStripe} />
          {/* subtle diagonal shine */}
          <View pointerEvents="none" style={styles.shine} />
          <Image source={require("@/assets/brand/robot-watermark.png")} style={styles.watermark} contentFit="contain" accessible={false} alt="" />

          <View style={styles.cardTop}>
            <Text style={styles.cardKicker} numberOfLines={1}>{withBrand("ask Elon", "accent")}</Text>
            <Text style={styles.cardTag} numberOfLines={1} testID="profile-card-title">{t("pcTitle").toUpperCase()}</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.left}>
              <View style={styles.personRow}>
                {user?.picture ? (
                  <Image source={{ uri: user.picture }} style={[styles.avatar, compact && styles.avatarCompact, big && styles.avatarBig]} testID="profile-avatar" accessibilityLabel={user?.name} />
                ) : (
                  <View style={[styles.avatar, compact && styles.avatarCompact, big && styles.avatarBig, styles.avatarFallback]} testID="profile-avatar-initials"><Text style={styles.initials}>{initials}</Text></View>
                )}
                <View style={{ flex: 1, minWidth: 0 }} testID="profile-name">
                  <Text style={styles.firstName} numberOfLines={1} testID="profile-first-name">{first || user?.email?.split("@")[0] || "—"}</Text>
                  {!!last && <Text style={[styles.surname, { fontSize: surnameSize }]} numberOfLines={1} testID="profile-surname">{last.toUpperCase()}</Text>}
                </View>
              </View>
              <View style={styles.badges} testID="profile-card-badges">
                {proOn ? (
                  <View style={[styles.badge, styles.badgePro, fx("chipProGlow")]} testID="profile-member-badge"><Text style={styles.badgeProText} numberOfLines={1}>★ PRO</Text></View>
                ) : (
                  <View style={[styles.badge, styles.badgeGlass]} testID="profile-no-sub-badge"><Text style={styles.badgeText} numberOfLines={1}>{t("noSubscription")}</Text></View>
                )}
                {user?.role === "admin" && (
                  <View style={[styles.badge, styles.badgeGreen]} testID="profile-admin-badge"><Text style={styles.badgeGreenText}>{t("pfAdmin")}</Text></View>
                )}
                <View style={[styles.badge, styles.badgeGlass]} testID="profile-card-language"><Text style={styles.badgeText} numberOfLines={1}>{LANG_FLAGS[locale]} {locale.toUpperCase()}</Text></View>
                {!!since && (
                  <View style={[styles.badge, styles.badgeGlass]} testID="profile-card-since-year"><Text style={styles.badgeText} numberOfLines={1}>{t("pcSinceYear", { year: since })}</Text></View>
                )}
              </View>
            </View>
            {!!accountId && (
              <View style={styles.qrTile} testID="profile-qr">
                <QrCode value={accountId} size={qrSize} accessibilityLabel={t("pcQrA11y", { id: accountId })} />
              </View>
            )}
          </View>

          <View style={styles.cardFoot}>
            <Pressable onPress={copyId} accessibilityRole="button" accessibilityLabel={`${t("accountId")} ${accountId}. ${t("pfCopyId")}`} testID="profile-account-id-copy"
              style={({ pressed }) => [{ flexShrink: 0, maxWidth: "100%" }, pressed && { opacity: 0.75 }]} hitSlop={6}>
              <Text style={styles.footLabel}>{t("accountId").toUpperCase()}</Text>
              <View style={styles.idRow}>
                <Text style={[styles.idVal, compact && styles.idValCompact, big && styles.idValBig]} testID="profile-account-id" numberOfLines={1}>{shownId}</Text>
                <Ionicons name="copy-outline" size={15} color={colors.muted} />
              </View>
            </Pressable>
            <Text style={styles.qrHint} numberOfLines={2} testID="profile-qr-hint">{t("pcQrHint")}</Text>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

/** Two separate cards under the profile card: employer details and personal details (only filled fields). */
export function ProfileSections({ onEdit }: { onEdit: () => void }) {
  const { user, locale } = useAuth();
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const row = width >= PROFILE_SECTIONS_ROW_MIN_WIDTH;
  const service = formatEmploymentLength(user?.start_date, locale);

  type F = [string, string | undefined | null, string?];
  const list = (fields: F[]) => fields.filter(([, v]) => !!v);
  const missing = (fields: F[]) => fields.filter(([, v]) => !v).map(([l]) => l.toLowerCase());

  const employerFields: F[] = [
    [t("industry"), user?.industry, "industry"],
    [t("pfJobTitle"), user?.job_title, "job-title"],
    [t("contractType"), user?.contract_type ? t(`ct_${user.contract_type}` as any) : "", "contract"],
    [t("pfCompanyNo"), user?.employer_company_number, "company-number"],
    [t("pfWorkplace"), user?.workplace_address, "workplace"],
    [t("pfHrEmail"), user?.hr_email, "hr-email"],
    [t("pfSince"), user?.start_date ? formatDate(user.start_date, locale) : "", "start"],
    [t("cardService"), service, "service"],
  ];
  const personalFields: F[] = [
    [t("pfEmail"), user?.email, "email"],
    [t("pfPhone"), user?.phone, "phone"],
    [t("homeAddress"), user?.address, "address"],
    [t("pfLanguage"), `${LANG_FLAGS[locale]} ${t("langName")}`, "language"],
    [t("accountSince"), user?.created_at ? formatDate(user.created_at, locale) : "", "since"],
  ];

  const rows = (fields: F[], prefix: string) => (
    <View style={styles.rows}>
      {list(fields).map(([label, val, id]) => (
        <View key={label} style={styles.kv} testID={`${prefix}-${id}`}>
          <Text style={styles.kLabel}>{label}</Text>
          <Text style={[styles.kVal, id === "service" && styles.kAccent]} selectable>{val}</Text>
        </View>
      ))}
    </View>
  );

  const section = (icon: any, title: string, children: ReactNode, testID: string, hint?: string) => (
    <View style={[styles.section, row && styles.sectionRow, fx("cardShadow")]} testID={testID}>
      <View style={styles.secHead}>
        <View style={styles.secIcon}><Ionicons name={icon} size={17} color={colors.askOrange} /></View>
        <Text style={styles.secTitle} numberOfLines={1}>{title}</Text>
      </View>
      {children}
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );

  const empMissing = missing(employerFields.filter(([, , id]) => id !== "service"));
  const perMissing = missing(personalFields);

  return (
    <View style={styles.sectionsWrap}>
      <View style={styles.dataHead} testID="profile-view">
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={styles.dataTitle}>{t("pcYourData")}</Text>
          <Text style={styles.hint}>{t("pfEditHint")}</Text>
        </View>
        <Pressable testID="profile-edit-button" onPress={onEdit} style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}>
          <Ionicons name="create-outline" size={16} color={colors.brandPrimaryText} />
          <Text style={styles.editText}>{t("edit")}</Text>
        </Pressable>
      </View>
      <View style={[styles.sections, row && styles.sectionsRowWrap]}>
        {section("business", t("secEmployer"), user?.employer ? (
          <>
            <Text style={styles.employerName} testID="profile-employer-name">{user.employer}</Text>
            {rows(employerFields, "profile-employer")}
          </>
        ) : (
          <Text style={styles.hint} testID="profile-employer-empty">{t("pcNoEmployer")}</Text>
        ), "profile-section-employer", user?.employer && empMissing.length ? t("pcMissing", { list: empMissing.join(", ") }) : undefined)}
        {section("person", t("secPersonal"), rows(personalFields, "profile-personal"), "profile-section-personal",
          perMissing.length ? t("pcMissing", { list: perMissing.join(", ") }) : undefined)}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { alignSelf: "center", marginTop: 16 },
  cardOuter: { borderRadius: 22 },
  cardBg: { borderRadius: 22, padding: 18, paddingLeft: 24, overflow: "hidden", gap: 12, borderWidth: 1, borderColor: c.border, justifyContent: "space-between" },
  cardBgCompact: { padding: 14, paddingLeft: 20, gap: 10 },
  cardStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6, backgroundColor: c.askOrange },
  shine: { position: "absolute", top: -120, left: "38%", width: 90, height: 520, backgroundColor: "rgba(255,255,255,0.05)", transform: [{ rotate: "28deg" }] },
  watermark: { position: "absolute", right: -30, bottom: -36, width: 150, height: 150, opacity: 0.08 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardKicker: { color: c.onSurface, fontSize: 15, fontWeight: "900", letterSpacing: 0.3, flexShrink: 1 },
  cardTag: { color: c.askOrange, fontSize: 10.5, fontWeight: "800", letterSpacing: 1.4, flexShrink: 0 },
  body: { flexDirection: "row", alignItems: "center", gap: 14 },
  left: { flex: 1, minWidth: 0, gap: 12 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 2.5, borderColor: c.onBrandPrimary, flexShrink: 0 },
  avatarCompact: { width: 46, height: 46, borderRadius: 23 },
  avatarBig: { width: 66, height: 66, borderRadius: 33 },
  avatarFallback: { backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center" },
  initials: { color: c.onAccent, fontSize: 19, fontWeight: "900" },
  firstName: { color: c.muted, fontSize: 14.5, fontWeight: "700" },
  surname: { color: c.onSurface, fontSize: 21, fontWeight: "900", letterSpacing: 1, marginTop: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { height: 24, borderRadius: 999, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  badgePro: { backgroundColor: c.askOrange },
  badgeProText: { color: c.onAccent, fontSize: 11.5, fontWeight: "900", letterSpacing: 0.6 },
  badgeGreen: { backgroundColor: "rgba(46,229,157,0.14)", borderWidth: 1, borderColor: "rgba(46,229,157,0.45)" },
  badgeGreenText: { color: c.brandPrimaryText, fontSize: 11.5, fontWeight: "800" },
  badgeGlass: { backgroundColor: c.glassFill, borderWidth: 1, borderColor: c.glassBorder },
  badgeText: { color: c.onBrandPrimary, fontSize: 11.5, fontWeight: "700" },
  qrTile: { padding: 4, borderRadius: 12, backgroundColor: "#FFFFFF", flexShrink: 0 },
  cardFoot: { flexDirection: "row", alignItems: "flex-end", gap: 10, borderTopWidth: 1, borderTopColor: c.glassDivider, paddingTop: 10 },
  footLabel: { color: c.muted, fontSize: 10.5, fontWeight: "700", letterSpacing: 1.2 },
  idRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  idVal: { color: c.onSurface, fontSize: 17, fontWeight: "800", letterSpacing: 1.6, fontVariant: ["tabular-nums"], flexShrink: 1 },
  idValCompact: { fontSize: 15, letterSpacing: 1 },
  idValBig: { fontSize: 20 },
  qrHint: { color: c.footnote, fontSize: 10.5, textAlign: "right", flex: 1, minWidth: 0 },
  // sections
  sectionsWrap: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  dataHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 2 },
  dataTitle: { color: c.onSurface, fontSize: 17, fontWeight: "800" },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: c.brandPrimaryBorder, backgroundColor: c.surfaceSecondary, flexShrink: 0 },
  editText: { color: c.brandPrimaryText, fontWeight: "800", fontSize: 13 },
  sections: { gap: 12 },
  sectionsRowWrap: { flexDirection: "row", alignItems: "flex-start" },
  section: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  sectionRow: { flex: 1, minWidth: 0 },
  secHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  secIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: c.askOrangeTint, alignItems: "center", justifyContent: "center" },
  secTitle: { color: c.onSurface, fontSize: 16, fontWeight: "800", flexShrink: 1 },
  employerName: { color: c.onSurface, fontSize: 19, fontWeight: "900" },
  rows: { gap: 0 },
  kv: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.divider },
  kLabel: { color: c.muted, fontSize: 12, fontWeight: "600" },
  kVal: { color: c.onSurface, fontSize: 15, fontWeight: "600", marginTop: 2 },
  kAccent: { color: c.askOrange, fontWeight: "800" },
  hint: { color: c.footnote, fontSize: 13, lineHeight: 19 },
}));
