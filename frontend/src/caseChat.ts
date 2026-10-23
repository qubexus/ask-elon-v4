// A case's original text (its description) is already the first chat message when the case was saved from a chat
// ("add as case" stores description = first user message); then it's not repeated as a separate bubble.
export function descriptionIsFirstMessage(description: string, messages: { role: string; text: string }[]) {
  const d = (description || "").trim();
  const first = messages.find((m) => m.role === "user");
  return !d || (!!first && first.text.trim().startsWith(d.replace(/…$/, "")));
}
