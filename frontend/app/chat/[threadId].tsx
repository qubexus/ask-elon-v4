import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, View } from "react-native";

import { ChatView } from "@/src/components/ChatView";
import { Header } from "@/src/components/Header";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme";

export default function CaseChat() {
  const { threadId, title } = useLocalSearchParams<{ threadId: string; title?: string }>();
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="case-chat-screen">
      <Header back title={title || t("elonTitle")} subtitle={t("elonTitle")} right={<Pressable testID="case-details-button" onPress={() => router.push(`/case/${threadId}`)} hitSlop={8} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name="information-circle-outline" size={24} color={colors.onBrandSecondary} /></Pressable>} />
      <ChatView threadId={threadId} bottomOffset={0} />
    </View>
  );
}
