/**
 * Scraped text can hold a lone UTF-16 surrogate (an emoji cut in half by a truncation)
 * or a NUL byte; Prisma's JSON encoder and Postgres text columns reject both and the
 * whole raw item is lost.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function toSafeDbText(value: string): string {
  return value.replace(LONE_SURROGATE, "").replace(/\u0000/g, "");
}

/** Applies {@link toSafeDbText} to every string inside a JSON-like value. */
export function toSafeDbValue<T>(value: T): T {
  if (typeof value === "string") return toSafeDbText(value) as T;
  if (Array.isArray(value)) return value.map((item) => toSafeDbValue(item)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [toSafeDbText(key), toSafeDbValue(item)]),
    ) as T;
  }
  return value;
}
