import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Locale } from "@/src/i18n";
import { fx, makeStyles } from "@/src/theme";

const LANGS: { id: Locale; label: string; flag: string }[] = [
  { id: "pl", label: "Polski", flag: "🇵🇱" },
  { id: "en", label: "English", flag: "🇬🇧" },
  { id: "ro", label: "Română", flag: "🇷🇴" },
];

export const LANG_FLAGS: Record<Locale, string> = { pl: "🇵🇱", en: "🇬🇧", ro: "🇷🇴" };

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
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.seg, active && styles.segActive, active && fx("languageActive")]}
          >
            <Text style={styles.flag}>{l.flag}</Text>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", gap: 8 },
  seg: { flex: 1, minWidth: 0, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.borderStrong, paddingHorizontal: 4 },
  segActive: { backgroundColor: c.heritageOrangeSoft, borderColor: c.askOrange },
  flag: { fontSize: 14 },
  label: { color: c.brandSecondaryText, fontWeight: "600", fontSize: 14, flexShrink: 1 },
  labelActive: { color: c.askInk, fontWeight: "800" },
}));
