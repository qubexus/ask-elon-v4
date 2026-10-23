import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { AnimatedTabBar } from "@/src/components/AnimatedTabBar";
import { useT } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const t = useT();
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimaryText}>
        <NativeTabs.Trigger name="cases">
          <NativeTabs.Trigger.Icon sf="folder.fill" />
          <NativeTabs.Trigger.Label>{t("tabCases")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="templates">
          <NativeTabs.Trigger.Icon sf="doc.text.fill" />
          <NativeTabs.Trigger.Label>{t("tabTemplates")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" />
          <NativeTabs.Trigger.Label>Elon</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="forum">
          <NativeTabs.Trigger.Icon sf="person.3.fill" />
          <NativeTabs.Trigger.Label>{t("tabForum")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" />
          <NativeTabs.Trigger.Label>{t("tabProfile")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs initialRouteName="index" tabBar={(props) => <AnimatedTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="cases" options={{ title: t("tabCases") }} />
      <Tabs.Screen name="templates" options={{ title: t("tabTemplates") }} />
      <Tabs.Screen name="index" options={{ title: t("tabChat") }} />
      <Tabs.Screen name="forum" options={{ title: t("tabForum") }} />
      <Tabs.Screen name="profile" options={{ title: t("tabProfile") }} />
    </Tabs>
  );
}
