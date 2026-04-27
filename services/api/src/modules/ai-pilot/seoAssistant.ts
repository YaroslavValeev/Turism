import type { Env } from "@mywave/config";
import { callOpenAiJson } from "./openaiJson";

export type SeoAssistantResult = {
  metaTitle: string;
  metaDescription: string;
  slug: string;
  faq: Array<{ question: string; answer: string }>;
  internalLinkSuggestions: string[];
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function fallbackSeo(input: { title?: string; discipline?: string; region?: string; summary?: string }): SeoAssistantResult {
  const title = input.title?.trim() || "Программа MyWave";
  const discipline = input.discipline?.trim() || "активности";
  const region = input.region?.trim() || "регион";
  const summary = input.summary?.trim() || `${title} в ${region}.`;
  const metaTitle = `${title} — ${discipline} | MyWave`;
  const metaDescription = `${summary}`.slice(0, 155);
  const slug = slugify(`${discipline}-${region}-${title}`) || "program-mywave";
  return {
    metaTitle,
    metaDescription,
    slug,
    faq: [
      { question: "Какой уровень подготовки нужен?", answer: "Проверьте поле level в карточке и уточните у организатора." },
      { question: "Что включено в стоимость?", answer: "Смотрите блок included/notIncluded в карточке программы." },
    ],
    internalLinkSuggestions: ["/programs", "/collections", "/blog"],
  };
}

const SYSTEM = `Ты SEO-ассистент для карточек программ MyWave.
Верни JSON строго формата:
{
  "metaTitle": "",
  "metaDescription": "",
  "slug": "",
  "faq": [{ "question": "", "answer": "" }],
  "internalLinkSuggestions": []
}
Ограничения:
- Никаких обещаний абсолютной безопасности/гарантированного результата.
- Не выдумывай факты, используй только входные данные.
- slug короткий, латиница/цифры/дефис.
`;

export async function buildSeoAssistant(
  env: Env,
  input: { title?: string; discipline?: string; region?: string; summary?: string }
): Promise<{ result: SeoAssistantResult; source: "llm" | "fallback"; reason?: string }> {
  const fallback = fallbackSeo(input);
  const r = await callOpenAiJson(
    env,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(input) },
    ],
    { timeoutMs: 45_000 }
  );
  if (!r.ok || typeof r.json !== "object" || !r.json) {
    return { result: fallback, source: "fallback", reason: r.ok ? "invalid_llm_shape" : r.reason };
  }
  const j = r.json as Record<string, unknown>;
  const faq =
    Array.isArray(j.faq) && j.faq.length
      ? j.faq
          .filter((x) => x && typeof x === "object")
          .map((x) => x as Record<string, unknown>)
          .map((x) => ({ question: String(x.question ?? ""), answer: String(x.answer ?? "") }))
      : fallback.faq;
  const links =
    Array.isArray(j.internalLinkSuggestions) && j.internalLinkSuggestions.length
      ? j.internalLinkSuggestions.map(String)
      : fallback.internalLinkSuggestions;
  return {
    source: "llm",
    result: {
      metaTitle: typeof j.metaTitle === "string" ? j.metaTitle : fallback.metaTitle,
      metaDescription: typeof j.metaDescription === "string" ? j.metaDescription : fallback.metaDescription,
      slug: typeof j.slug === "string" && j.slug.trim() ? j.slug : fallback.slug,
      faq,
      internalLinkSuggestions: links,
    },
  };
}
