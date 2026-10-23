import { useEffect, useState } from "react";
import { Platform } from "react-native";

// Mobile web: public/index.html sizes the app shell to window.visualViewport (the area above the on-screen keyboard)
// and sets <html data-kb="1"> while the keyboard is open. This hook mirrors that flag for components.
// Native apps never use it (react-native-keyboard-controller handles the keyboard there).
export const KB_EVENT = "askelon-kb";

function read(): boolean {
  return Platform.OS === "web" && typeof document !== "undefined" && document.documentElement.dataset.kb === "1";
}

export function useWebKeyboardOpen(): boolean {
  const [open, setOpen] = useState(read);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const on = () => setOpen(read());
    window.addEventListener(KB_EVENT, on);
    on();
    return () => window.removeEventListener(KB_EVENT, on);
  }, []);
  return open;
}
