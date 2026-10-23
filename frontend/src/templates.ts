import { api } from "@/src/api";

export type TemplateField = { key: string; labelEn: string; labelPl: string; labelRo: string; placeholder: string; defaultValue: string };
export type LegalTemplate = {
  id: string;
  titleEn: string;
  titlePl: string;
  titleRo: string;
  statutoryReference: string;
  category: string;
  descriptionEn: string;
  descriptionPl: string;
  descriptionRo: string;
  fields: TemplateField[];
  defaults: Record<string, string>;
  letter: string;
};

let cache: LegalTemplate[] | null = null;
export async function getTemplates() {
  if (!cache) cache = await api<LegalTemplate[]>("/templates");
  return cache;
}

export function renderLetter(tpl: LegalTemplate, values: Record<string, string>) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return tpl.letter.replace(/\{\{(\w+)\}\}/g, (_, k) => (k === "date" ? date : values[k]?.trim() || tpl.defaults[k] || ""));
}
