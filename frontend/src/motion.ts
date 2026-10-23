import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True when the user asked the OS / browser to reduce motion (web: prefers-reduced-motion). */
export function useReduceMotion() {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(!!v))
      .catch(() => alive && setReduce(false));
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: any) => setReduce(typeof v === "boolean" ? v : !!v?.matches));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}
