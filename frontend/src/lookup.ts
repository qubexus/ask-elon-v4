import { api, ApiError } from "@/src/api";
import type { StringKey } from "@/src/i18n";

export type Business = {
  id: string; name: string; kind: string; housenumber: string; street: string; town: string; postcode: string;
  postcode_guessed?: boolean; distance_m: number | null; address: string; source: string;
};
export type NearbyResult = { postcode: { postcode: string; district: string }; results: Business[]; provider: string; attribution: string };
export type Company = { company_number: string; name: string; status: string; address: string; postcode: string; registered_office: boolean };
export type LookupConfig = { postcode_businesses: boolean; company_number: boolean };

const UK_PC = /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i;
export const isUkPostcode = (s: string) => UK_PC.test(s.trim().replace(/\s+/g, " "));
export const normaliseCompanyNumber = (s: string) => {
  let v = s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (/^\d{1,7}$/.test(v)) v = v.padStart(8, "0");
  else if (/^[A-Z]{2}\d{1,5}$/.test(v)) v = v.slice(0, 2) + v.slice(2).padStart(6, "0");
  return v;
};
export const isCompanyNumber = (s: string) => /^([A-Z]{2}\d{6}|\d{8}|[A-Z]{2}\d{5}[A-Z]|R\d{7})$/.test(normaliseCompanyNumber(s));

export const lookupConfig = () => api<LookupConfig>("/lookup/config");
export const nearbyBusinesses = (pc: string, q = "") =>
  api<NearbyResult>(`/lookup/postcode/${encodeURIComponent(pc.trim())}/businesses${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
export const companyByNumber = (n: string) => api<Company>(`/lookup/company/${encodeURIComponent(normaliseCompanyNumber(n))}`);

/** Maps a lookup error to a translated message key (manual entry always stays possible). */
export function lookupErrorKey(e: unknown): StringKey {
  const code = e instanceof ApiError ? e.code : undefined;
  const status = e instanceof ApiError ? e.status : 0;
  if (code === "invalid_postcode") return "lk_errInvalidPc";
  if (code === "postcode_not_found") return "lk_errPcNotFound";
  if (code === "invalid_company_number") return "lk_errCompanyInvalid";
  if (code === "company_not_found") return "lk_errCompanyNotFound";
  if (code === "not_configured") return "lk_companyOff";
  if (code === "rate_limited" || status === 429) return "lk_errBusy";
  return "lk_errDown";
}
