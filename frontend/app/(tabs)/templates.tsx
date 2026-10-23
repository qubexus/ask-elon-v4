import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Header } from "@/src/components/Header";
import { localeSuffix, useT } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { getTemplates, LegalTemplate } from "@/src/templates";
import { makeStyles, useTheme } from "@/src/theme";

export default function Templates() {
  const t = useT();
  const { locale } = useAuth();
  const sfx = localeSuffix(locale);
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [items, setItems] = useState<LegalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cat, setCat] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await getTemplates());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const cats = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);
  const shown = cat ? items.filter((i) => i.category === cat) : items;

  return (
    <View style={styles.root} testID="templates-screen">
      <Header title={t("templatesTitle")} subtitle={t("templatesSub")} />
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[null, ...cats].map((c) => {
            const active = c === cat;
            return (
              <Pressable key={c ?? "all"} testID={`template-category-${c ?? "all"}`} onPress={() => setCat(c)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c ?? t("all")}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : error ? (
        <View style={styles.center} testID="templates-error">
          <Text style={styles.muted}>{t("loadError")}</Text>
          <Pressable testID="templates-retry-button" onPress={load} style={styles.retry}><Text style={styles.retryText}>{t("retry")}</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomChrome + 52 }]}
          ListEmptyComponent={<Text style={styles.muted} testID="templates-empty">{t("noTemplates")}</Text>}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 40).duration(280)}>
              <Pressable
                testID={`template-card-${item.id}`}
                onPress={() => router.push(`/template/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <View style={styles.icon}><Ionicons name="document-text" size={22} color={colors.brandTertiary} /></View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.cat}>{item.category}</Text>
                  <Text style={styles.title}>{(item as any)[`title${sfx}`]}</Text>
                  <Text style={styles.desc} numberOfLines={2}>{(item as any)[`description${sfx}`]}</Text>
                  <Text style={styles.ref} numberOfLines={1}>{item.statutoryReference}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  chipRow: { height: 56, justifyContent: "center", backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  chips: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  chipActive: { backgroundColor: c.brandSecondary, borderColor: c.brandSecondary },
  chipText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: c.onBrandSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: c.muted, fontSize: 14, textAlign: "center", paddingTop: 24 },
  retry: { backgroundColor: c.brandPrimary, paddingHorizontal: 20, height: 44, borderRadius: 12, justifyContent: "center" },
  retryText: { color: c.onBrandPrimary, fontWeight: "700" },
  list: { padding: 16, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.brandTertiarySoft, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  cat: { color: c.brandTertiary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  title: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  desc: { color: c.muted, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  ref: { color: c.brandPrimary, fontSize: 11, fontWeight: "600" },
}));
