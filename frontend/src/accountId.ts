// Customer account ID helpers (format defined in backend/account_ids.py):
//   [2 initials][YYMM][sequence, ≥4 digits][Damm check digit][T|E|R]   e.g. PK261000011T
const RE = /^([A-Z]{2})(\d{4})(\d{4,})(\d)([TER])$/;

/** Plain ID used for copy and QR. Falls back to the old AE-XXXXXX for users not yet migrated. */
export function accountIdOf(user: { account_id?: string; user_id?: string } | null | undefined): string {
  if (user?.account_id) return user.account_id;
  return user?.user_id ? `AE-${user.user_id.slice(-6).toUpperCase()}` : "";
}

/** "PK261000011T" -> "PK 2610 0001 1 T" (display only). */
export function formatAccountId(id: string): string {
  const m = RE.exec(id || "");
  return m ? m.slice(1).join(" ") : id || "";
}
