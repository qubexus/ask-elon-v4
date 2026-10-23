import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Header } from "@/src/components/Header";
import { ProLock } from "@/src/components/ProLock";
import { usePro } from "@/src/revenuecat";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";
import { Post, timeAgo } from "../(tabs)/forum";

type Comment = { comment_id: string; author: string; body: string; created_at: string };

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<(Post & { comments: Comment[] }) | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const isPro = usePro();

  const load = useCallback(async () => setPost(await api(`/forum/posts/${id}`)), [id]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const c = await api<Comment>(`/forum/posts/${id}/comments`, { method: "POST", body: { body: text } });
      setPost((p) => (p ? { ...p, comments: [...p.comments, c], comment_count: p.comment_count + 1 } : p));
      setText("");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSending(false);
    }
  };

  const like = async () => {
    const r = await api<{ liked: boolean; like_count: number }>(`/forum/posts/${id}/like`, { method: "POST" });
    setPost((p) => (p ? { ...p, ...r } : p));
  };

  return (
    <View style={styles.root} testID="forum-post-screen">
      <Header back title={t("tabForum")} />
      {!post ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.brandPrimary} />
      ) : (
        <FlatList
          data={post.comments}
          keyExtractor={(c) => c.comment_id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.post}>
              <Text style={styles.meta}>{post.author} · {timeAgo(post.created_at)} · {t(`fc_${post.category}` as any)}</Text>
              <Text style={styles.title} testID="forum-post-title">{post.title}</Text>
              <Text style={styles.body}>{post.body}</Text>
              <Pressable testID="forum-post-like" onPress={() => (isPro ? like() : router.push("/paywall"))} style={styles.like}>
                <Ionicons name={post.liked ? "heart" : "heart-outline"} size={20} color={post.liked ? colors.error : colors.muted} />
                <Text style={styles.likeText}>{post.like_count}</Text>
              </Pressable>
              <Text style={styles.section}>{t("comments")} ({post.comment_count})</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.comment} testID="forum-comment">
              <Text style={styles.cAuthor}>{item.author} <Text style={styles.cTime}>· {timeAgo(item.created_at)}</Text></Text>
              <Text style={styles.cBody}>{item.body}</Text>
            </View>
          )}
        />
      )}
      {!isPro ? (
        <View style={{ padding: 12, paddingBottom: insets.bottom + 12 }}>
          <ProLock testID="forum-comment-lock" text={t("freeForum")} />
        </View>
      ) : (
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.composer, { paddingBottom: insets.bottom + 12 }]}>
          <TextInput testID="forum-comment-input" value={text} onChangeText={setText} placeholder={t("writeComment")} placeholderTextColor={colors.muted} style={styles.input} multiline />
          <Pressable testID="forum-comment-send" onPress={send} disabled={!text.trim() || sending} style={[styles.send, (!text.trim() || sending) && { opacity: 0.4 }]}>
            {sending ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> : <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />}
          </Pressable>
        </View>
      </KeyboardStickyView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { padding: 16, gap: 10 },
  post: { gap: 10, marginBottom: 6 },
  meta: { color: c.muted, fontSize: 12, fontWeight: "600" },
  title: { color: c.onSurface, fontSize: 22, fontWeight: "900", lineHeight: 28 },
  body: { color: c.onSurface, fontSize: 15, lineHeight: 23, fontWeight: "500" },
  like: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 },
  likeText: { color: c.muted, fontWeight: "700" },
  section: { color: c.onSurface, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 },
  comment: { backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: c.border },
  cAuthor: { color: c.onSurface, fontWeight: "800", fontSize: 13 },
  cTime: { color: c.muted, fontWeight: "500" },
  cBody: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: c.surfaceTertiary, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: c.onSurface },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.tabForum, alignItems: "center", justifyContent: "center" },
}));
