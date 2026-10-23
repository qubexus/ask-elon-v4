import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "@/src/api";
import { AccentCard, Chip, Fab, useFabListPadding } from "@/src/components/Brand";
import { Header } from "@/src/components/Header";
import { useT } from "@/src/i18n";
import { usePro } from "@/src/revenuecat";
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
  const listPad = useFabListPadding();
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
      <Header robot="forum" title={t("forumTitle")} subtitle={t("forumSub")} />
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {["", ...FORUM_CATS].map((c) => (
            <Chip key={c || "all"} testID={`forum-category-${c || "all"}`} onPress={() => setCat(c)} active={cat === c} label={c ? t(`fc_${c}` as any) : t("all")} />
          ))}
        </ScrollView>
      </View>
      {!posts ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.brandPrimary} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.post_id}
          contentContainerStyle={[styles.list, { paddingBottom: listPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(cat); }} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Text style={styles.empty} testID="forum-empty">{t("noPosts")}</Text>}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 50).duration(280)}>
              <AccentCard testID={`forum-post-${item.post_id}`} onPress={() => router.push(`/forum/${item.post_id}`)}>
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
              </AccentCard>
            </Animated.View>
          )}
        />
      )}
      <Fab testID="forum-new-post-fab" icon="create-outline" label={t("newPost")} onPress={() => router.push(isPro ? "/new-post" : "/paywall")} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  chipRow: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: c.divider },
  chips: { paddingLeft: 16, paddingRight: 16, gap: 8, alignItems: "center" },
  list: { padding: 16, gap: 12 },
  empty: { color: c.muted, textAlign: "center", paddingTop: 32 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 12 },
  author: { color: c.onSurface, fontWeight: "700", fontSize: 13, flexShrink: 1 },
  time: { color: c.muted, fontSize: 12 },
  catTag: { marginLeft: "auto", flexShrink: 0, backgroundColor: c.tabActiveBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { color: c.brandPrimary, fontSize: 11, fontWeight: "800" },
  title: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  body: { color: c.muted, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  actions: { flexDirection: "row", gap: 20, marginTop: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  actionText: { color: c.muted, fontWeight: "700", fontSize: 13 },
}));
