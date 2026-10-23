import Ionicons from "@react-native-vector-icons/ionicons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatView } from "@/src/components/ChatView";
import { Header } from "@/src/components/Header";
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
        robot
        title={t("elonTitle")}
        subtitle={t("online")}
        right={
          <Pressable testID="chat-clear-button" onPress={fresh} hitSlop={8} accessibilityLabel={t("clearChat")} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="refresh-outline" size={22} color={colors.onBrandSecondary} />
          </Pressable>
        }
      />
      <ChatView key={threadId} threadId={threadId} isMain onSavedAsCase={fresh} bottomOffset={tabBar} />
    </View>
  );
}
