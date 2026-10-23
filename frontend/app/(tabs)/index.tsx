import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatView } from "@/src/components/ChatView";
import { Header, HeaderIconButton } from "@/src/components/Header";
import { useT } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function ChatTab() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Every app entry starts a fresh conversation (old sessions stay in the DB; save one via "add as case").
  const [threadId, setThreadId] = useState(() => `s_${Date.now()}`);
  const fresh = () => setThreadId(`s_${Date.now()}`);
  // Composer sits above the tab bar; on keyboard open it should rise only by the keyboard minus the tab bar.
  const tabBar = usesNativeTabs ? insets.bottom : 58 + Math.max(insets.bottom, 8);


  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingBottom: usesNativeTabs ? insets.bottom : 0 }} testID="chat-screen">
      <Header
        robot="elon"
        title={t("elonTabTitle")}
        subtitle={t("online")}
        online
        onlineA11y={t("onlineA11y")}
        right={<HeaderIconButton testID="chat-clear-button" icon="refresh-outline" onPress={fresh} label={t("clearChat")} />}
      />
      <ChatView key={threadId} threadId={threadId} isMain onSavedAsCase={fresh} bottomOffset={tabBar} />
    </View>
  );
}
