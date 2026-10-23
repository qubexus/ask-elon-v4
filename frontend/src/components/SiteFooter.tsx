import { Linking, Pressable, Text, View } from "react-native";

import { useT } from "@/src/i18n";
import { makeStyles } from "@/src/theme";

export const SITE_URL = "https://askelon.uk";
export const SUPPORT_EMAIL = "contact@askelon.uk";

/** Slim footer line: "Strona: askelon.uk · Pomoc: contact@askelon.uk" (both clickable). */
export function SiteFooter({ testID = "site-footer" }: { testID?: string }) {
  const t = useT();
  const styles = useStyles();
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.item}>
        <Text style={styles.label}>{t("footerSite")}: </Text>
        <Pressable onPress={() => open(SITE_URL)} accessibilityRole="link" hitSlop={8} testID={`${testID}-site`}>
          <Text style={styles.link}>askelon.uk</Text>
        </Pressable>
      </View>
      <Text style={styles.sep}>·</Text>
      <View style={styles.item}>
        <Text style={styles.label}>{t("footerHelp")}: </Text>
        <Pressable onPress={() => open(`mailto:${SUPPORT_EMAIL}`)} accessibilityRole="link" hitSlop={8} testID={`${testID}-mail`}>
          <Text style={styles.link}>{SUPPORT_EMAIL}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", columnGap: 6, rowGap: 2, paddingHorizontal: 12, paddingVertical: 6 },
  item: { flexDirection: "row", alignItems: "center" },
  label: { color: c.footnote, fontSize: 12, lineHeight: 18 },
  link: { color: c.askOrange, fontSize: 12, lineHeight: 18, fontWeight: "700", textDecorationLine: "underline" },
  sep: { color: c.footnote, fontSize: 12, lineHeight: 18 },
}));
