// PWA: registers public/sw.js (served as /sw.js) on the web build only.
// Not in development (Metro dev server / hot reload) and not on native. Registration runs after window "load",
// so it never competes with the first render. Errors are ignored: the app works the same without a service worker.
import { Platform } from "react-native";

let done = false;

export function registerServiceWorker(): void {
  if (done || Platform.OS !== "web" || __DEV__) return;
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  done = true;
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
