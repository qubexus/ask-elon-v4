import type { Locale } from "@/src/i18n";

/** Full date: PL/RO dd.mm.rrrr, EN dd/mm/yyyy. Accepts ISO strings (with or without zone) or Date. */
export function formatDate(date: string | number | Date | null | undefined, lang: Locale): string {
  if (date === null || date === undefined || date === "") return "";
  let d: Date;
  if (date instanceof Date) d = date;
  else if (typeof date === "number") d = new Date(date);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, dd] = date.split("-").map(Number);
    d = new Date(y, m - 1, dd);
  } else d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(date) || !date.includes("T") ? date : date + "Z");
  if (isNaN(d.getTime())) return typeof date === "string" ? date : "";
  const p = (n: number) => String(n).padStart(2, "0");
  const sep = lang === "en" ? "/" : ".";
  return `${p(d.getDate())}${sep}${p(d.getMonth() + 1)}${sep}${d.getFullYear()}`;
}
