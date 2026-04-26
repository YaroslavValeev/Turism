/**
 * Publish gate. Source of truth: program_card_schema.md (Required for publish).
 * Expanded: title, organizer, category/discipline, location, date/format, level, risk, gear, medical, cancellation, summary/structure, at least 1 media.
 */
import { Program, ProgramMedia } from "@prisma/client";

export type ProgramWithMedia = Program & { media: ProgramMedia[] };

function filled(s: string | null | undefined): boolean {
  return s != null && String(s).trim() !== "";
}

export function canPublish(program: ProgramWithMedia): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!filled(program.title)) missing.push("title");
  if (!program.organizerId) missing.push("organizer");
  if (!filled(program.discipline)) missing.push("category/discipline");
  if (!filled(program.region)) missing.push("location (region)");
  if (!program.startDate || !program.endDate) missing.push("date (start_date, end_date)");
  if (!filled(program.levelRequired)) missing.push("level/skill level");
  if (!filled(program.riskLevel)) missing.push("risk_level");
  if (!filled(program.gearRequirements)) missing.push("gear_requirements");
  if (program.medicalLimitations === undefined || program.medicalLimitations === null)
    missing.push("medical_limitations (set empty string if N/A)");
  if (!filled(program.cancellationRules)) missing.push("cancellation_rules");
  const hasSummary = filled(program.itineraryDayByDay) || filled(program.audienceFit) || filled(program.inclusions);
  if (!hasSummary) missing.push("program summary/structure (itinerary_day_by_day, audience_fit or inclusions)");
  if (!program.media?.length) missing.push("at least 1 media");
  return {
    ok: missing.length === 0,
    missing,
  };
}

/** Публикация в витрину из ingestion без ручного approve (мягче, чем canPublish). */
export function canPublishAutopilot(program: ProgramWithMedia): { ok: boolean; missing: string[] } {
  if (process.env.INGESTION_E2E_FORCE_GATE === "1") {
    return { ok: false, missing: ["e2e_forced_gate"] };
  }
  const missing: string[] = [];
  if (!filled(program.title) || String(program.title).trim().length < 2) missing.push("title");
  if (!program.organizerId) missing.push("organizer");
  if (!filled(program.discipline)) missing.push("discipline");
  if (!filled(program.region)) missing.push("region");
  if (!program.startDate || !program.endDate) missing.push("date_range");
  if (!filled(program.levelRequired)) missing.push("level");
  if (!filled(program.riskLevel)) missing.push("risk");
  if (program.medicalLimitations === undefined || program.medicalLimitations === null) missing.push("medical");
  if (!filled(program.cancellationRules)) missing.push("cancellation");
  const hasLink = filled(program.sourceUrl) || filled(program.cta);
  const hasDetailBlock =
    filled(program.audienceFit) || filled(program.itineraryDayByDay) || filled(program.inclusions);
  if (!hasLink && !hasDetailBlock && !(program.media?.length)) {
    missing.push("source_url_or_content_or_media");
  }
  return { ok: missing.length === 0, missing };
}
