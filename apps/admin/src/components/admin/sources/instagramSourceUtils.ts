/**
 * Нормализация ссылок Instagram для поля `urlOrHandle` (без трекинг-query `igsh=`).
 */
export function stripInstagramTrackingAndNormalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (h !== "instagram.com" && h !== "m.instagram.com" && !h.endsWith(".instagram.com")) {
      return trimmed;
    }
    u.search = "";
    u.hash = "";
    let out = u.toString();
    if (out.endsWith("/") && u.pathname.length > 1) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return trimmed;
  }
}

export function suggestInstagramSourceName(url: string): string {
  try {
    const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
    const parts = u.pathname.split("/").filter(Boolean);
    const h = (parts[0] ?? "").toLowerCase();
    if (["reel", "reels", "p", "tv"].includes(h) && parts[1]) {
      return `Instagram ${h} ${parts[1]}`;
    }
    if (parts[0]) {
      return `Instagram @${parts[0]}`;
    }
  } catch {
    /* empty */
  }
  return "Instagram";
}

export function parseInstagramUrlLines(text: string): string[] {
  return text
    .split(/[\n\r]+/)
    .map((l) => stripInstagramTrackingAndNormalizeUrl(l))
    .filter(Boolean);
}
