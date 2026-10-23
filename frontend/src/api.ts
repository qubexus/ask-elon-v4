import { fetch as expoFetch } from "expo/fetch";

export const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(t: string | null) {
  token = t;
}
export const getApiToken = () => token;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    let code: string | undefined;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : msg;
      code = typeof j.code === "string" ? j.code : undefined;
    } catch {}
    throw new ApiError(res.status, msg, code);
  }
  return res.json();
}

// Streams SSE events from /chat/stream. Calls onDelta per token chunk; onEvent gets every other event
// (document / document_error / done with the final cleaned text when Elon wrote a document).
export async function streamChat(text: string, threadId: string, onDelta: (d: string) => void, onEvent?: (ev: any) => void): Promise<string | null> {
  let messageId: string | null = null;
  const res = await expoFetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    body: JSON.stringify({ text, thread_id: threadId }),
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, `Error ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith("data:")) continue;
      const ev = JSON.parse(line.slice(5));
      if (ev.error) throw new Error(ev.error);
      if (ev.delta) onDelta(ev.delta);
      else onEvent?.(ev);
      if (ev.done) messageId = ev.message_id;
    }
  }
  return messageId;
}
