export const PROGRAM_MEDIA_TYPES = ["image", "video"] as const;

export type ProgramDates = { startDate: Date; endDate: Date };

/**
 * Validates the editable card fields of PATCH /programs/:id.
 * Returns an error message for the first invalid field, or null.
 */
export function validateProgramCardPatch(body: Record<string, unknown>, current: ProgramDates): string | null {
  for (const key of ["title", "region"] as const) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || !(body[key] as string).trim())) {
      return `${key} must be a non-empty string`;
    }
  }

  let start = current.startDate;
  let end = current.endDate;
  for (const key of ["startDate", "endDate"] as const) {
    if (body[key] === undefined) continue;
    const parsed = new Date(String(body[key]));
    if (body[key] === null || body[key] === "" || Number.isNaN(parsed.getTime())) {
      return `${key} must be a valid date`;
    }
    if (key === "startDate") start = parsed;
    else end = parsed;
  }
  if (end.getTime() < start.getTime()) return "endDate cannot be earlier than startDate";

  if (body.durationDays !== undefined) {
    const days = Number(body.durationDays);
    if (!Number.isInteger(days) || days < 1) return "durationDays must be a positive integer";
  }
  if (body.priceFromRub !== undefined && body.priceFromRub !== null && body.priceFromRub !== "") {
    const price = Number(body.priceFromRub);
    if (!Number.isInteger(price) || price < 0) return "priceFromRub must be a non-negative integer or null";
  }
  return null;
}

/** Media may point to our own cached files or to an external http(s) URL. */
export function validateProgramMediaInput(mediaType: unknown, url: unknown): string | null {
  if (typeof mediaType !== "string" || !(PROGRAM_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return "mediaType must be image or video";
  }
  const value = typeof url === "string" ? url.trim() : "";
  if (!value) return "url required";
  if (value.startsWith("/ingestion-media/")) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return null;
  } catch {
    // fallthrough
  }
  return "url must be http(s) or a local /ingestion-media/ path";
}
