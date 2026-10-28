/** Presentation only: source text and stored references are never rewritten. */
export function candidateHeading(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Название не указано";
  if (text.length <= 120) return text;
  const prefix = text.slice(0, 117);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > 65 ? boundary : prefix.length)}…`;
}

export type CandidateMedia = { url: string; kind: "image" | "video" };

export function candidateMedia(imageUrl: string | null | undefined, raw: unknown): CandidateMedia[] {
  const media = new Map<string, CandidateMedia>();
  const add = (value: unknown, type?: unknown) => {
    if (typeof value !== "string") return;
    const url = value.trim().replace(/^\/\//, "https://");
    if (!/^https?:\/\//i.test(url) && !/^\/(?!\/)/.test(url)) return;
    if (/telegram\.org\/img\/emoji\//i.test(url)) return;
    const kind = type === "video" || /\.(mp4|webm|mov)(\?|#|$)/i.test(url) ? "video" : "image";
    // Explicit source media metadata wins over an inferred cover type.
    const existing = media.get(url);
    if (!existing || kind === "video") media.set(url, { url, kind });
  };
  add(imageUrl);
  if (Array.isArray(raw)) for (const item of raw) {
    if (typeof item === "string") add(item);
    else if (item && typeof item === "object") add(item.url, item.mediaType ?? item.type);
  }
  return [...media.values()].slice(0, 12);
}

export function candidateDate(value: string | null | undefined): string {
  if (!value) return "Дата не указана";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Дата требует проверки" : date.toLocaleDateString("ru-RU", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}
