import { translitToLatin } from "./exploreTranslit";

/** Нормализация для сравнения вариантов/синонимов. */
export function normToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, " ");
}

/**
 * display value → default slug, если нет ручного mapping.
 * Кириллица транслитерируется, оставляем [a-z0-9-].
 */
export function valueToDefaultSlug(value: string): string {
  const t = translitToLatin(value.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-"));
  return t
    .normalize("NFKD")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
