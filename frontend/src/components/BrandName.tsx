// Brand name "ask Elon": "ask" always lowercase (inherits the surrounding text colour),
// "Elon" in the app palette. Nested <Text>, so it keeps the parent's font size, weight and
// line clamping and can sit inside sentences (headers, buttons, disclaimers, chat bubbles).
import { Fragment, ReactNode } from "react";
import { StyleProp, Text, TextStyle } from "react-native";

import { useTheme } from "@/src/theme";

/** Plain-text form for places without styling (document title, alt text, app name). */
export const BRAND_PLAIN = "ask Elon";

/**
 * accent = site orange askOrange #FF6A00 (dark bars, screens, cards: ≥ 4.7:1).
 * soft   = light orange warning #FFD3A6 (on green buttons/cards and chat bubbles, where #FF6A00 is < 4.5:1).
 */
export type BrandTone = "accent" | "soft";

export function BrandName({ tone = "accent", style }: { tone?: BrandTone; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return (
    <Text style={[{ textTransform: "none" }, style]} testID="brand-name">
      ask <Text style={{ color: tone === "soft" ? colors.warning : colors.askOrange }}>Elon</Text>
    </Text>
  );
}

const BRAND_RE = /ask Elon/i;

/** Replaces every "ask Elon" (any case) in a translated string with <BrandName />. `rest` transforms the other parts (e.g. uppercase). */
export function withBrand(text: string | undefined | null, tone: BrandTone = "accent", rest: (s: string) => string = (s) => s): ReactNode {
  if (!text) return text ?? null;
  if (!BRAND_RE.test(text)) return rest(text);
  const parts = text.split(/ask Elon/i);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <BrandName tone={tone} />}
      {rest(part)}
    </Fragment>
  ));
}
