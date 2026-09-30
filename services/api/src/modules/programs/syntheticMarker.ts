/**
 * Признак тестовой/синтетической программы. Кириллические маркеры — только с начала слова:
 * иначе «естественный», «протестировать» и т.п. прятали настоящие карточки.
 */
const SYNTHETIC_MARKER_RE = /\b(e2e|test|demo|seed|synthetic)\b|(?<![\p{L}\p{N}])(тест|синтет)|cmof/u;

export function containsSyntheticMarker(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return false;
  return SYNTHETIC_MARKER_RE.test(v);
}
