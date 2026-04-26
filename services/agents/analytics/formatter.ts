const TELEGRAM_MAX = 4096;

/**
 * Разбивает длинный текст на части ≤4096 символов (граница по переводу строки, если есть).
 */
export function splitTelegramMessage(text: string): string[] {
  const t = text.trim();
  if (t.length <= TELEGRAM_MAX) return [t];
  const parts: string[] = [];
  let rest = t;
  while (rest.length > 0) {
    if (rest.length <= TELEGRAM_MAX) {
      parts.push(rest);
      break;
    }
    let cut = rest.lastIndexOf("\n", TELEGRAM_MAX);
    if (cut < TELEGRAM_MAX * 0.5) {
      cut = TELEGRAM_MAX;
    }
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  return parts.filter(Boolean);
}
