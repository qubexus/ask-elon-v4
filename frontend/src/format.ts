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

/** Parses "YYYY-MM-DD" (or an ISO date) as a local calendar date; null when invalid. */
function parseDay(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const out = new Date(y, mo - 1, d);
  // reject impossible dates like 2024-02-31
  if (out.getFullYear() !== y || out.getMonth() !== mo - 1 || out.getDate() !== d) return null;
  return out;
}

/** Whole months from `start` to `today` (a month counts once the same day-of-month is reached). null = invalid or in the future. */
export function monthsBetween(start: string | Date | null | undefined, today: Date = new Date()): number | null {
  const s = parseDay(start);
  const t = parseDay(today);
  if (!s || !t || s.getTime() > t.getTime()) return null;
  let months = (t.getFullYear() - s.getFullYear()) * 12 + (t.getMonth() - s.getMonth());
  // last day of a shorter month counts as reaching the day (31 Jan -> 28 Feb = 1 month)
  const lastDayOfT = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  if (t.getDate() < s.getDate() && t.getDate() !== lastDayOfT) months -= 1;
  return Math.max(0, months);
}

/** Polish plural form: 1 -> one, 2-4 (not 12-14) -> few, else -> many. */
function plPlural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
}

/** Romanian: 1 an, 2–19 ani, 20+ (and 0) "de ani" (also 101–119 without "de"). */
function roCount(n: number, one: string, other: string) {
  if (n === 1) return `1 ${one}`;
  const h = n % 100;
  return h >= 1 && h <= 19 ? `${n} ${other}` : `${n} de ${other}`;
}

function unit(n: number, kind: "y" | "m", lang: Locale): string {
  if (lang === "pl") return `${n} ${kind === "y" ? plPlural(n, "rok", "lata", "lat") : plPlural(n, "miesiąc", "miesiące", "miesięcy")}`;
  if (lang === "ro") return kind === "y" ? roCount(n, "an", "ani") : roCount(n, "lună", "luni");
  return `${n} ${kind === "y" ? (n === 1 ? "year" : "years") : n === 1 ? "month" : "months"}`;
}

/**
 * Length of employment from a start date to today, e.g.
 * PL "2 lata i 5 miesięcy", "1 rok", "5 lat", "11 miesięcy", "<1 miesiąc";
 * EN "2 years 5 months"; RO "2 ani și 5 luni", "20 de ani".
 * Returns "" for a missing, invalid or future date (the caller hides it).
 */
export function formatEmploymentLength(start: string | Date | null | undefined, lang: Locale, today: Date = new Date()): string {
  const total = monthsBetween(start, today);
  if (total === null) return "";
  if (total < 1) return lang === "pl" ? "<1 miesiąc" : lang === "ro" ? "<1 lună" : "<1 month";
  const y = Math.floor(total / 12), m = total % 12;
  const parts = [y ? unit(y, "y", lang) : "", m ? unit(m, "m", lang) : ""].filter(Boolean);
  const join = lang === "pl" ? " i " : lang === "ro" ? " și " : " ";
  return parts.join(join);
}
