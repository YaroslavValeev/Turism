const OPTIONAL_TEXT_FIELDS = [
  "sourceChannel", "sourceCampaign", "notes", "entryType", "entryId",
  "utmSource", "utmMedium", "exploreType", "exploreSlug",
] as const;

export type BookingIntake = {
  programId: string;
  guestContact: string;
  legalConsent?: unknown;
} & Partial<Record<(typeof OPTIONAL_TEXT_FIELDS)[number], string>>;

type Result = { ok: true; data: BookingIntake } | { ok: false; error: string };

/** Validate before Prisma or string methods; never echo contact data in errors. */
export function validateBookingIntake(input: unknown): Result {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid booking request" };
  }
  const body = input as Record<string, unknown>;
  if (body.programId == null || body.guestContact == null) {
    return { ok: false, error: "programId and guestContact required" };
  }
  if (typeof body.programId !== "string" || typeof body.guestContact !== "string") {
    return { ok: false, error: "programId and guestContact must be strings" };
  }
  const programId = body.programId.trim();
  const guestContact = body.guestContact.trim();
  if (!programId || !guestContact) {
    return { ok: false, error: "programId and guestContact required" };
  }
  // Match the public form limit; retain free-form contacts used by existing clients.
  if (guestContact.length > 254) {
    return { ok: false, error: "guestContact must not exceed 254 characters" };
  }
  const data: BookingIntake = { programId, guestContact, legalConsent: body.legalConsent };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = body[field];
    // Existing clients may omit optional strings or send null.
    if (value == null) continue;
    if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
    data[field] = value;
  }
  return { ok: true, data };
}
