// Pure helpers for the main menu drawer (src/components/MenuPanel.tsx). No React / RN imports so they can be
// unit-tested with node (scripts/test-menu.mjs).

export type MenuNavItem = { key: string; href: string; icon: string; iconOn: string; label: "menuChat" | "tabCases" | "tabTemplates" | "tabForum" | "tabProfile"; match: (p: string) => boolean };

// Same order, labels and icons as the bottom tab bar (AnimatedTabBar / app/(tabs)/_layout.tsx).
export const MENU_TABS: MenuNavItem[] = [
  { key: "chat", href: "/", icon: "chatbubbles-outline", iconOn: "chatbubbles", label: "menuChat", match: (p) => p === "/" || p === "/index" || p.startsWith("/chat") },
  { key: "cases", href: "/cases", icon: "folder-outline", iconOn: "folder", label: "tabCases", match: (p) => p.startsWith("/cases") || p.startsWith("/case/") || p === "/new-case" },
  { key: "templates", href: "/templates", icon: "document-text-outline", iconOn: "document-text", label: "tabTemplates", match: (p) => p.startsWith("/templates") || p.startsWith("/template/") },
  { key: "forum", href: "/forum", icon: "people-outline", iconOn: "people", label: "tabForum", match: (p) => p.startsWith("/forum") || p === "/new-post" },
  { key: "profile", href: "/profile?tab=data", icon: "person-circle-outline", iconOn: "person-circle", label: "tabProfile", match: (p) => p.startsWith("/profile") },
];

/** Unread-messages badge text: undefined for 0, "9+" above 9. */
export function unreadBadge(n: number) {
  return n > 0 ? (n > 9 ? "9+" : String(n)) : undefined;
}
