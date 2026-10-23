import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { ChatView } from "@/src/components/ChatView";
import { Header, HeaderIconButton } from "@/src/components/Header";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme";

export default function CaseChat() {
  const { threadId, title } = useLocalSearchParams<{ threadId: string; title?: string }>();
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="case-chat-screen">
      <Header back title={title || t("elonTitle")} subtitle={t("online")} online onlineA11y={t("onlineA11y")} right={<HeaderIconButton testID="case-details-button" icon="information-circle-outline" onPress={() => router.push(`/case/${threadId}`)} label={t("caseTitle")} />} />
      <ChatView threadId={threadId} bottomOffset={0} />
    </View>
  );
}
