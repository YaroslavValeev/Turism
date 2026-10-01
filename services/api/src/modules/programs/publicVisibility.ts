type PublicProgramVisibilityShape = {
  publishStatus: string;
  startDate: Date | string | null;
  endDate?: Date | string | null;
  scheduleType?: string | null;
  spotsAvailable?: number | null;
  autoPublished?: boolean | null;
  reviewStatus?: string | null;
  organizer?: { verificationStatus?: string | null } | null;
};

/** Prisma select with every field {@link isProgramPubliclyVisible} reads. */
export const PUBLIC_VISIBILITY_SELECT = {
  publishStatus: true,
  startDate: true,
  endDate: true,
  scheduleType: true,
  spotsAvailable: true,
  autoPublished: true,
  reviewStatus: true,
  organizer: { select: { verificationStatus: true } },
} as const;

/** Paused or rejected organizers must not sell through the storefront, whatever the program status. */
export const HIDDEN_ORGANIZER_STATUSES: readonly string[] = ["paused", "rejected"];

export function isOrganizerHiddenFromStorefront(verificationStatus: string | null | undefined): boolean {
  return verificationStatus != null && HIDDEN_ORGANIZER_STATUSES.includes(verificationStatus);
}

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Programs further out than this are kept published but off the storefront;
 * they appear by themselves once the start date comes within the window.
 */
export const PUBLIC_HORIZON_DAYS = 183;
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** First day the program becomes visible on the storefront, or null when it is already inside the window. */
export function storefrontVisibleFrom(startDate: Date | string | null | undefined, now = new Date()): Date | null {
  const start = toDate(startDate);
  if (!start) return null;
  const opensAt = startOfUtcDay(start) - PUBLIC_HORIZON_DAYS * DAY_MS;
  return opensAt > startOfUtcDay(now) ? new Date(opensAt) : null;
}

export function isProgramPubliclyVisible(program: PublicProgramVisibilityShape, now = new Date()): boolean {
  if (program.publishStatus !== "published") return false;
  if (isOrganizerHiddenFromStorefront(program.organizer?.verificationStatus)) return false;
  // Ingestion may create a complete-looking record from untrusted source markup.
  // It becomes public only after an operator has explicitly passed review.
  if (program.autoPublished && program.reviewStatus !== "ok") return false;
  if (program.spotsAvailable != null && program.spotsAvailable <= 0) return false;
  // У тура «по запросу» в датах окно сезона, а не заезд: его бронируют заранее, горизонт витрины не применяется.
  if (program.scheduleType !== "on_request" && storefrontVisibleFrom(program.startDate, now)) return false;
  if (program.endDate != null) {
    const endDate = program.endDate instanceof Date ? program.endDate : new Date(program.endDate);
    if (!Number.isFinite(endDate.getTime())) return false;
    // Date-only program ranges are stored at midnight; keep the end date visible
    // for the full calendar day and hide it starting the following UTC day.
    if (startOfUtcDay(endDate) < startOfUtcDay(now)) return false;
  }
  return true;
}
