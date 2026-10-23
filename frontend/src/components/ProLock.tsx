import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

/** Compact "this is a PRO feature" bar with a CTA to the paywall. */
export function ProLock({ text, testID = "pro-lock" }: { text: string; testID?: string }) {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} testID={testID}>
      <Ionicons name="lock-closed" size={18} color={colors.gold} />
      <Text style={styles.text}>{text}</Text>
      <Pressable testID={`${testID}-cta`} onPress={() => router.push("/paywall")} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
        <Text style={styles.ctaText}>{t("pwUnlock")}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.gold },
  text: { flex: 1, color: c.onSurface, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  cta: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.heritageOrange, justifyContent: "center" },
  ctaText: { color: c.onAccent, fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
}));
