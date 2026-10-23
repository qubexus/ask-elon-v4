import Ionicons from "@react-native-vector-icons/ionicons";
import { useCallback, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

export type Letter = { letter_id: string; title: string; recipient: string; amount_gbp?: number | null; status: "awaiting" | "paid" | "acas"; sent_at: string; deadline_at: string };

export const ACAS_URL = "https://www.acas.org.uk/early-conciliation";
const DAY = 86400000;
export const isOverdue = (l: Letter) => l.status === "awaiting" && new Date(l.deadline_at).getTime() <= Date.now();

export async function reportToAcas(id: string) {
  await api(`/letters/${id}`, { method: "PATCH", body: { status: "acas" } });
  Linking.openURL(ACAS_URL);
}

/** "Sent letters" card with a 7-day reply countdown; shown at the top of the Cases tab. */
export function SentLetters() {
  const t = useT();
  const { locale } = useAuth();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const [letters, setLetters] = useState<Letter[]>([]);

  const load = useCallback(() => {
    api<Letter[]>("/letters").then(setLetters).catch(() => {});
  }, []);
  useFocusEffect(load);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  if (!letters.length) return null;
  return (
    <View style={styles.card} testID="sent-letters">
      <Text style={styles.title}>{t("sentLetters")}</Text>
      {letters.map((l) => {
        const sent = new Date(l.sent_at).getTime();
        const left = Math.max(0, Math.ceil((new Date(l.deadline_at).getTime() - Date.now()) / DAY));
        const pct = Math.min(1, (Date.now() - sent) / (7 * DAY));
        const overdue = isOverdue(l);
        return (
          <View key={l.letter_id} style={styles.item} testID={`letter-${l.letter_id}`}>
            <View style={styles.rowBetween}>
              <Text style={styles.itemTitle} numberOfLines={1}>{l.title}</Text>
              <Pressable testID={`letter-delete-${l.letter_id}`} onPress={() => act(() => api(`/letters/${l.letter_id}`, { method: "DELETE" }))} hitSlop={10}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.meta}>
              {formatDate(l.sent_at, locale)} · {l.recipient || "HR"}{l.amount_gbp ? ` · £${l.amount_gbp.toFixed(2)}` : ""}
            </Text>
            {l.status === "awaiting" ? (
              <>
                <View style={styles.track}><View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: overdue ? colors.error : colors.heritageOrange }]} /></View>
                <Text style={[styles.count, overdue && { color: colors.error }]} testID={`letter-countdown-${l.letter_id}`}>
                  {overdue ? t("deadlinePassed") : t("daysLeft", { n: String(left) })}
                </Text>
                <View style={styles.actions}>
                  <Pressable testID={`letter-paid-${l.letter_id}`} onPress={() => act(() => api(`/letters/${l.letter_id}`, { method: "PATCH", body: { status: "paid" } }))} style={styles.secondary}>
                    <Ionicons name="checkmark" size={16} color={colors.success} />
                    <Text style={[styles.secondaryText, { color: colors.success }]}>{t("letterPaid")}</Text>
                  </Pressable>
                  {overdue && (
                    <Pressable testID={`letter-acas-${l.letter_id}`} onPress={() => act(() => reportToAcas(l.letter_id))} style={styles.primary}>
                      <Ionicons name="open-outline" size={16} color={colors.onError} />
                      <Text style={styles.primaryText}>{t("letterAcas")}</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : (
              <Text style={[styles.count, { color: l.status === "paid" ? colors.success : colors.info }]} testID={`letter-status-${l.letter_id}`}>
                {l.status === "paid" ? t("letterPaidDone") : t("letterAcasDone")}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.heritageOrangeSoft, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: c.heritageOrange, marginBottom: 4 },
  title: { color: c.onSurface, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  item: { backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 12, gap: 6 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  itemTitle: { flex: 1, color: c.onSurface, fontWeight: "800", fontSize: 15 },
  meta: { color: c.muted, fontSize: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  count: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  secondary: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, flexDirection: "row", gap: 6, alignItems: "center" },
  secondaryText: { fontWeight: "700", fontSize: 13 },
  primary: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.error, flexDirection: "row", gap: 6, alignItems: "center" },
  primaryText: { color: c.onError, fontWeight: "800", fontSize: 13 },
}));
