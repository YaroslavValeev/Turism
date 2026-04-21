import type { PublicOrganizerIntake } from "@prisma/client";
import { inclusiveDurationDaysUTC } from "@mywave/shared-types";
import { prisma } from "../../lib/prisma";
import type { ProgramIntakeMetaV2 } from "../public-intake/programSubmissionDraft";
import { validateProgramSubmissionDraft } from "../public-intake/programSubmissionDraft";
import { recordDomainStatusEvent } from "../status-engine/recordDomainStatusEvent";

export async function createDraftProgramFromIntake(params: {
  intake: PublicOrganizerIntake;
  meta: ProgramIntakeMetaV2;
  organizerId: string;
  adminUserId: string | null;
}): Promise<{ programId: string }> {
  const { intake, meta, organizerId, adminUserId } = params;
  const invalid = validateProgramSubmissionDraft(meta);
  if (invalid) {
    throw new Error(invalid);
  }

  const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { id: true } });
  if (!organizer) {
    throw new Error("organizer_not_found");
  }

  const d = meta.programDraft;
  const title = intake.programTitle?.trim() || "Программа без названия";
  const discipline = intake.discipline?.trim() || "other";
  const region = intake.region?.trim() || "—";

  return prisma.$transaction(async (tx) => {
    const program = await tx.program.create({
      data: {
        organizerId,
        title,
        discipline,
        region,
        exactLocation: String(d.exactLocation).trim(),
        startDate: new Date(String(d.startDate)),
        endDate: new Date(String(d.endDate)),
        durationDays: inclusiveDurationDaysUTC(new Date(String(d.startDate)), new Date(String(d.endDate))),
        formatType: d.formatType?.trim() || null,
        audienceFit: d.audienceFit?.trim() || null,
        levelRequired: String(d.levelRequired).trim(),
        riskLevel: String(d.riskLevel).trim(),
        priceFromRub: d.priceFromRub != null && Number.isFinite(Number(d.priceFromRub)) ? Math.round(Number(d.priceFromRub)) : null,
        currency: (d.currency && String(d.currency).trim()) || "RUB",
        inclusions: d.inclusions?.trim() || null,
        exclusions: d.exclusions?.trim() || null,
        gearRequirements: d.gearRequirements?.trim() || null,
        medicalLimitations:
          d.medicalLimitations === null || d.medicalLimitations === undefined ? null : String(d.medicalLimitations),
        itineraryDayByDay: d.itineraryDayByDay?.trim() || null,
        organizerName:
          d.organizerDisplayName?.trim() || intake.organization?.trim() || intake.contactName?.trim() || null,
        trustReason: d.trustReason?.trim() || null,
        reviewsSummary: d.reviewsSummary?.trim() || null,
        cancellationRules: d.cancellationRules?.trim() || null,
        whatHappensAfterBooking: d.whatHappensAfterBooking?.trim() || null,
        cta: d.cta?.trim() || null,
        intakeSource: "organizer_form",
        publishStatus: "draft",
        isStarred: false,
      },
    });

    const fromIntakeStatus = intake.processingStatus;
    await tx.publicOrganizerIntake.update({
      where: { id: intake.id },
      data: {
        processingStatus: "draft_created",
        linkedProgramId: program.id,
        processedAt: new Date(),
        processedBy: adminUserId,
      },
    });

    await recordDomainStatusEvent(tx, {
      eventType: "program_draft_created",
      entityType: "program",
      entityId: program.id,
      fromStatus: null,
      toStatus: "draft",
      triggerMode: "auto",
      actorId: adminUserId,
      actorMarker: adminUserId ? null : "system",
      reason: "draft program from public organizer intake",
      source: "POST /admin/organizer-intakes/:id/draft-program",
      payloadJson: { intakeId: intake.id, organizerId },
      idempotencyKey: `intake_draft_program:${intake.id}`,
    });
    await recordDomainStatusEvent(tx, {
      eventType: "intake_processed",
      entityType: "public_organizer_intake",
      entityId: intake.id,
      fromStatus: fromIntakeStatus,
      toStatus: "draft_created",
      triggerMode: "auto",
      actorId: adminUserId,
      actorMarker: adminUserId ? null : "system",
      reason: "linked draft program",
      source: "POST /admin/organizer-intakes/:id/draft-program",
      payloadJson: { programId: program.id },
      idempotencyKey: `intake_draft_intake_status:${intake.id}`,
    });

    return { programId: program.id };
  });
}
