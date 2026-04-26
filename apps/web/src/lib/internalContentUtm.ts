/**
 * G4: единый задел для внутренней перелинковки (blog / collection / program / explore).
 * Позже можно связать с `content_metrics` — пока достаточно query.
 */
export type ContentEntryType = "blog" | "collection" | "program" | "explore";

export function buildInternalContentQuery(
  entryType: ContentEntryType,
  entryId: string,
  extra?: Record<string, string | undefined | null>,
): string {
  const p = new URLSearchParams();
  p.set("utm_source", "internal");
  p.set("utm_medium", "content");
  p.set("entry_type", entryType);
  p.set("entry_id", entryId);
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v == null || v === "") continue;
    p.set(k, v);
  }
  return p.toString();
}

export function withInternalContentQuery(
  pathWithOptionalQuery: string,
  entryType: ContentEntryType,
  entryId: string,
  extra?: Record<string, string | undefined | null>,
): string {
  const [path, existing] = pathWithOptionalQuery.split("?");
  const p = new URLSearchParams(existing ?? "");
  p.set("utm_source", "internal");
  p.set("utm_medium", "content");
  p.set("entry_type", entryType);
  p.set("entry_id", entryId);
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v == null || v === "") continue;
    p.set(k, v);
  }
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}
