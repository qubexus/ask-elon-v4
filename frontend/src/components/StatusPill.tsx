import { Text, View } from "react-native";

import { useT } from "@/src/i18n";
import { makeStyles } from "@/src/theme";

export function StatusPill({ status }: { status: string }) {
  const t = useT();
  const styles = useStyles();
  const open = status === "open";
  return (
    <View style={[styles.pill, open ? styles.open : styles.resolved]} testID={`status-pill-${status}`}>
      <View style={[styles.dot, open ? styles.dotOpen : styles.dotResolved]} />
      <Text style={[styles.text, open ? styles.textOpen : styles.textResolved]}>{open ? t("open") : t("resolved")}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 999, alignSelf: "flex-start" },
  open: { backgroundColor: c.warningSoft },
  resolved: { backgroundColor: c.successSoft },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOpen: { backgroundColor: c.warning },
  dotResolved: { backgroundColor: c.success },
  text: { fontSize: 12, fontWeight: "700" },
  textOpen: { color: c.warning },
  textResolved: { color: c.success },
}));
