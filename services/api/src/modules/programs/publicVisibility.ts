type PublicProgramVisibilityShape = {
  publishStatus: string;
  endDate?: Date | string | null;
  spotsAvailable?: number | null;
  autoPublished?: boolean | null;
  reviewStatus?: string | null;
};

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function isProgramPubliclyVisible(program: PublicProgramVisibilityShape, now = new Date()): boolean {
  if (program.publishStatus !== "published") return false;
  // Ingestion may create a complete-looking record from untrusted source markup.
  // It becomes public only after an operator has explicitly passed review.
  if (program.autoPublished && program.reviewStatus !== "ok") return false;
  if (program.spotsAvailable != null && program.spotsAvailable <= 0) return false;
  if (program.endDate != null) {
    const endDate = program.endDate instanceof Date ? program.endDate : new Date(program.endDate);
    if (!Number.isFinite(endDate.getTime())) return false;
    // Date-only program ranges are stored at midnight; keep the end date visible
    // for the full calendar day and hide it starting the following UTC day.
    if (startOfUtcDay(endDate) < startOfUtcDay(now)) return false;
  }
  return true;
}
