import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Locale } from "@/src/i18n";
import { makeStyles } from "@/src/theme";

const LANGS: { id: Locale; label: string }[] = [
  { id: "pl", label: "Polski" },
  { id: "en", label: "English" },
  { id: "ro", label: "Română" },
];

export function LanguageSwitch() {
  const { locale, setLocale } = useAuth();
  const styles = useStyles();
  return (
    <View style={styles.row} testID="language-switch">
      {LANGS.map((l) => {
        const active = l.id === locale;
        return (
          <Pressable
            key={l.id}
            testID={`language-option-${l.id}`}
            onPress={() => setLocale(l.id)}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 4, gap: 4 },
  seg: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segActive: { backgroundColor: c.surfaceSecondary, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  label: { color: c.muted, fontWeight: "600", fontSize: 14 },
  labelActive: { color: c.brandPrimary },
}));
