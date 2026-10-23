import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export const UNREAD_KEY = ["inbox", "unread"];

/** Unread admin-message count: refreshes on login, every 60 s, and when the app/tab returns to the foreground. */
export function useUnreadCount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...UNREAD_KEY, user?.user_id],
    queryFn: () => api<{ count: number }>("/messages/unread-count"),
    enabled: !!user,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && qc.invalidateQueries({ queryKey: UNREAD_KEY }));
    return () => sub.remove();
  }, [qc]);
  return q.data?.count ?? 0;
}

export function useRefreshUnread() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: UNREAD_KEY });
}
