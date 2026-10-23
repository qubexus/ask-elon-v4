// Documents Elon writes in the chat ("Dokumenty od Elona"): types, stream helpers, download and share.
// Nothing here ever sends anything by itself: share opens the system share sheet or a pre-filled e-mail draft.
import { Linking, Platform, Share } from "react-native";

import { api, API_BASE } from "@/src/api";
import type { StringKey } from "@/src/i18n";

export type ChatDocCard = {
  chat_doc_id: string;
  type: string;
  title: string;
  language?: string;
  created_at: string;
  thumb_url?: string;
  deleted?: boolean;
};

export type ChatDoc = ChatDocCard & {
  subject?: string;
  recipient?: string;
  thread_id?: string;
  case_id?: string | null;
  case_title?: string | null;
  pages?: number;
  size?: number;
  pdf_url?: string;
  filename?: string;
  has_translation?: boolean;
  updated_at?: string;
};

export type ChatDocFull = ChatDoc & {
  body: string;
  translation?: string;
  translation_lang?: string | null;
  snapshot: { sender_lines: string[]; recipient_lines: string[]; date_text: string; hr_email: string };
};

export type DocPage = { items: ChatDoc[]; total: number; offset: number; has_more: boolean };
export type StorageUsage = {
  used: number; limit: number; remaining: number; percent: number; warn: boolean; full: boolean;
  used_text: string; limit_text: string; remaining_text: string;
};

export const CHAT_DOCS_KEY = ["chat-documents"];
export const STORAGE_KEY = ["storage-usage"];

export const typeKey = (type: string) => (`edt_${["hr_letter", "grievance", "ssp_demand", "wage_claim", "holiday_pay"].includes(type) ? type : "other"}`) as StringKey;
export const fileUrl = (path?: string) => (path ? `${API_BASE}${path}` : "");

const OPEN = "[[DOKUMENT";
/** While a reply streams: hide the raw document block (and a half-received marker) from the bubble. */
export function splitStreamText(text: string): { text: string; drafting: boolean } {
  const i = text.search(/\[\[\s*DOKUMENT/i);
  if (i >= 0) return { text: text.slice(0, i).trimEnd(), drafting: true };
  for (let k = Math.min(OPEN.length - 1, text.length); k > 0; k--) {
    if (OPEN.startsWith(text.slice(-k).toUpperCase())) return { text: text.slice(0, -k).trimEnd(), drafting: false };
  }
  return { text, drafting: false };
}

// The entrance animation plays once per document, only for documents that arrived live in this session
// (not for history loads, re-renders or a list item that is re-mounted).
const fresh = new Set<string>();
const played = new Set<string>();
export const markFresh = (id: string) => fresh.add(id);
export const shouldAnimate = (id: string) => fresh.has(id) && !played.has(id);
export const markPlayed = (id: string) => played.add(id);

/** Fresh signed links (they expire after an hour) for one document. */
export const getChatDoc = (id: string) => api<ChatDocFull>(`/chat-documents/${encodeURIComponent(id)}`);

export async function downloadPdf(doc: ChatDoc): Promise<void> {
  const url = fileUrl(doc.pdf_url) + "&dl=1";
  if (Platform.OS === "web") {
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename || "ask-elon.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  await Linking.openURL(url);
}

/** "shared" = system share sheet with the PDF file; "mail" = PDF downloaded + e-mail draft opened (user attaches + sends). */
// Web Share needs a recent tap: the PDF is fetched ahead (when the viewer opens) so share() runs right away.
const files = new Map<string, Promise<File | null>>();
export function prefetchPdf(doc: ChatDoc) {
  if (Platform.OS !== "web" || !doc.pdf_url || typeof navigator === "undefined" || !(navigator as any).canShare) return;
  const key = `${doc.chat_doc_id}:${doc.updated_at ?? ""}`;
  if (!files.has(key)) {
    files.set(key, fetch(fileUrl(doc.pdf_url)).then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? new File([b], doc.filename || "ask-elon.pdf", { type: "application/pdf" }) : null)).catch(() => null));
  }
  return files.get(key);
}

export async function sharePdf(doc: ChatDocFull): Promise<"shared" | "mail" | "cancelled"> {
  const subject = doc.subject || doc.title;
  if (Platform.OS === "web") {
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share && nav?.canShare) {
      try {
        const file = await prefetchPdf(doc);
        if (file && nav.canShare({ files: [file] })) {
          try {
            await nav.share({ files: [file], title: subject });
            return "shared";
          } catch (e: any) {
            if (e?.name === "AbortError") return "cancelled";
          }
        }
      } catch {}
    }
    await downloadPdf(doc);
    const to = doc.snapshot?.hr_email || "";
    const mail = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(doc.body.slice(0, 6000))}`;
    setTimeout(() => { window.location.href = mail; }, 350); // let the download start first
    return "mail";
  }
  const r = await Share.share({ title: subject, message: `${subject}\n\n${doc.body}` });
  return r.action === Share.dismissedAction ? "cancelled" : "shared";
}
