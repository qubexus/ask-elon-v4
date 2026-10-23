import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Header } from "@/src/components/Header";
import { useT } from "@/src/i18n";
import { usePro } from "@/src/revenuecat";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";

export type Post = { post_id: string; author: string; category: string; title: string; body: string; like_count: number; liked: boolean; comment_count: number; created_at: string };
export const FORUM_CATS = ["wages", "contracts", "agency", "housing", "health", "general"];

export function timeAgo(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").getTime()) / 60000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
}

export default function Forum() {
  const t = useT();
  const isPro = usePro();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [cat, setCat] = useState("");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (c: string) => {
    try {
      setPosts(await api<Post[]>(`/forum/posts?category=${c}`));
    } catch {
      setPosts((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(cat);
    }, [load, cat]),
  );

  const like = async (p: Post) => {
    const r = await api<{ liked: boolean; like_count: number }>(`/forum/posts/${p.post_id}/like`, { method: "POST" });
    setPosts((ps) => ps?.map((x) => (x.post_id === p.post_id ? { ...x, ...r } : x)) ?? null);
  };

  return (
    <View style={styles.root} testID="forum-screen">
      <Header title={t("forumTitle")} subtitle={t("forumSub")} />
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {["", ...FORUM_CATS].map((c) => (
            <Pressable key={c || "all"} testID={`forum-category-${c || "all"}`} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipOn]}>
              <Text style={[styles.chipText, cat === c && styles.chipTextOn]}>{c ? t(`fc_${c}` as any) : t("all")}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {!posts ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.brandPrimary} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.post_id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomChrome + 96 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(cat); }} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Text style={styles.empty} testID="forum-empty">{t("noPosts")}</Text>}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 50).duration(280)}>
              <Pressable testID={`forum-post-${item.post_id}`} onPress={() => router.push(`/forum/${item.post_id}`)} style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}>
                <View style={styles.meta}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{item.author[0]?.toUpperCase()}</Text></View>
                  <Text style={styles.author} numberOfLines={1}>{item.author}</Text>
                  <Text style={styles.time}>· {timeAgo(item.created_at)}</Text>
                  <View style={styles.catTag}><Text style={styles.catText}>{t(`fc_${item.category}` as any)}</Text></View>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
                <View style={styles.actions}>
                  <Pressable testID={`forum-like-${item.post_id}`} onPress={() => (isPro ? like(item) : router.push("/paywall"))} hitSlop={8} style={styles.action}>
                    <Ionicons name={item.liked ? "heart" : "heart-outline"} size={18} color={item.liked ? colors.error : colors.muted} />
                    <Text style={styles.actionText}>{item.like_count}</Text>
                  </Pressable>
                  <View style={styles.action}>
                    <Ionicons name="chatbubble-outline" size={17} color={colors.muted} />
                    <Text style={styles.actionText}>{item.comment_count}</Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          )}
        />
      )}
      <Pressable testID="forum-new-post-fab" onPress={() => router.push(isPro ? "/new-post" : "/paywall")} style={({ pressed }) => [styles.fab, { bottom: bottomChrome + 16 }, pressed && { transform: [{ scale: 0.95 }] }]}>
        <Ionicons name="create-outline" size={20} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>{t("newPost")}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  chipRow: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: c.divider },
  chips: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  chipOn: { backgroundColor: c.tabForum, borderColor: c.tabForum },
  chipText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: c.onBrandPrimary },
  list: { padding: 16, gap: 12 },
  empty: { color: c.muted, textAlign: "center", paddingTop: 32 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: c.border },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.tabForum, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 12 },
  author: { color: c.onSurface, fontWeight: "700", fontSize: 13, flexShrink: 1 },
  time: { color: c.muted, fontSize: 12 },
  catTag: { marginLeft: "auto", backgroundColor: c.successSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { color: c.tabForum, fontSize: 11, fontWeight: "800" },
  title: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  body: { color: c.muted, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  actions: { flexDirection: "row", gap: 20, marginTop: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  actionText: { color: c.muted, fontWeight: "700", fontSize: 13 },
  fab: { position: "absolute", right: 16, height: 52, paddingHorizontal: 20, borderRadius: 12, backgroundColor: c.tabForum, flexDirection: "row", alignItems: "center", gap: 8, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  fabText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.6 },
}));
