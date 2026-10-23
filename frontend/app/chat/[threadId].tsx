import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { ChatView } from "@/src/components/ChatView";
import { Header, HeaderIconButton } from "@/src/components/Header";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme";

// Chat bound to one case: threadId is the case_id (cases list, case details and "add as case" all link here).
export default function CaseChat() {
  const { threadId, title } = useLocalSearchParams<{ threadId: string; title?: string }>();
  const t = useT();
  const { colors } = useTheme();
  const [caseTitle, setCaseTitle] = useState<string | null>(null);
  const isCase = typeof threadId === "string" && threadId.startsWith("case_");
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="case-chat-screen">
      <Header back title={caseTitle || title || t("elonTitle")} subtitle={t("online")} online onlineA11y={t("onlineA11y")} right={<HeaderIconButton testID="case-details-button" icon="information-circle-outline" onPress={() => router.push(`/case/${threadId}`)} label={t("caseChatDetails")} />} />
      <ChatView key={threadId} threadId={threadId} caseId={isCase ? threadId : undefined} onCaseLoaded={(c) => setCaseTitle(c.title)} bottomOffset={0} />
    </View>
  );
}
