// QR code drawn with plain <View>s (no react-native-svg needed), so it renders the same on
// Expo web, iOS and Android. Encoder: qrcode-generator (MIT, pure JS). Each row is drawn as
// runs of dark modules, which keeps the view count low (~150 views for a version-2 code).
import makeQr from "qrcode-generator";
import { useMemo } from "react";
import { View } from "react-native";

/** Boolean module matrix for `value` (byte mode, auto version). Exported for tests. */
export function qrMatrix(value: string, ecl: "L" | "M" | "Q" | "H" = "M"): boolean[][] {
  const qr = makeQr(0, ecl);
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

type Props = { value: string; size: number; color?: string; background?: string; quiet?: number; testID?: string; accessibilityLabel?: string };

export function QrCode({ value, size, color = "#0F1A24", background = "#FFFFFF", quiet = 2, testID, accessibilityLabel }: Props) {
  const m = useMemo(() => (value ? qrMatrix(value) : []), [value]);
  if (!m.length) return null;
  const n = m.length + quiet * 2;
  // Whole-pixel modules keep edges crisp (no anti-aliased seams between runs).
  const cell = Math.max(1, Math.floor(size / n));
  const side = cell * n;
  return (
    <View testID={testID} accessible={!!accessibilityLabel} accessibilityRole="image" accessibilityLabel={accessibilityLabel}
      style={{ width: side, height: side, backgroundColor: background, padding: cell * quiet }}>
      {m.map((row, r) => {
        const runs: { x: number; w: number }[] = [];
        let start = -1;
        row.forEach((dark, c) => {
          if (dark && start < 0) start = c;
          if ((!dark || c === row.length - 1) && start >= 0) {
            const end = dark ? c + 1 : c;
            runs.push({ x: start, w: end - start });
            start = -1;
          }
        });
        return (
          <View key={r} style={{ height: cell, width: cell * row.length }}>
            {runs.map((run) => (
              <View key={run.x} style={{ position: "absolute", left: run.x * cell, top: 0, width: run.w * cell, height: cell, backgroundColor: color }} />
            ))}
          </View>
        );
      })}
    </View>
  );
}
