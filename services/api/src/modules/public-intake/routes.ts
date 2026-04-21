/**
 * Публичные заявки организаторов с лендинга (пилот). Без авторизации.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { sendOpsTelegramAlertBestEffort } from "../../lib/opsTelegramAlert";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import {
  buildProgramSubmissionMessage,
  parseProgramIntakeMetaV2,
  parseStoredProgramIntakeMeta,
  validateProgramSubmissionDraft,
} from "./programSubmissionDraft";

const ALLOWED_TYPES = new Set(["program_submission", "verification_inquiry"]);

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function publicOrganizerIntakeRoutes(): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const b = req.body as Record<string, unknown>;
      const intakeType = String(b.intakeType ?? "").trim();
      if (!ALLOWED_TYPES.has(intakeType)) {
        res.status(400).json({
          error: "intakeType must be program_submission or verification_inquiry",
        });
        return;
      }

      const contactName = String(b.contactName ?? "").trim();
      const contactEmail = String(b.contactEmail ?? "").trim().toLowerCase();
      if (!contactName || !contactEmail) {
        res.status(400).json({ error: "contactName and contactEmail are required" });
        return;
      }
      if (!isEmail(contactEmail)) {
        res.status(400).json({ error: "invalid contactEmail" });
        return;
      }

      let programTitle: string | null = b.programTitle != null ? String(b.programTitle).trim() || null : null;
      let plannedDates: string | null = b.plannedDates != null ? String(b.plannedDates).trim() || null : null;
      let message: string | null = b.message != null ? String(b.message).trim() || null : null;
      let meta: object | undefined =
        b.meta != null && typeof b.meta === "object" && !Array.isArray(b.meta) ? (b.meta as object) : undefined;

      if (intakeType === "program_submission") {
        const metaV2 = parseProgramIntakeMetaV2(b);
        if (metaV2) {
          const invalid = validateProgramSubmissionDraft(metaV2);
          if (invalid) {
            res.status(400).json({ error: invalid });
            return;
          }
          if (!programTitle) {
            res.status(400).json({ error: "programTitle is required for program_submission" });
            return;
          }
          message = buildProgramSubmissionMessage(metaV2, message ?? "");
          meta = metaV2 as object;
          const d = metaV2.programDraft;
          plannedDates = `${String(d.startDate)} — ${String(d.endDate)} (${String(d.durationDays)} дн.)`;
        } else if (!programTitle) {
          res.status(400).json({ error: "programTitle is required for program_submission" });
          return;
        }
      }

      const row = await prisma.publicOrganizerIntake.create({
        data: {
          intakeType,
          contactName,
          contactEmail,
          contactPhone: b.contactPhone != null ? String(b.contactPhone).trim() || null : null,
          organization: b.organization != null ? String(b.organization).trim() || null : null,
          programTitle,
          discipline: b.discipline != null ? String(b.discipline).trim() || null : null,
          region: b.region != null ? String(b.region).trim() || null : null,
          plannedDates,
          message,
          links: b.links != null ? String(b.links).trim() || null : null,
          meta,
        },
      });

      const hasWizardV2 = parseStoredProgramIntakeMeta(row.meta) != null;
      emitBackendAnalyticsEventBestEffort({
        event_name: "intake_created",
        event_version: 1,
        event_source: "backend",
        event_time: row.createdAt.toISOString(),
        idempotency_key: `intake_created:${row.id}`,
        page_type: "public_organizer_intake",
        discipline: row.discipline ?? undefined,
        region: row.region ?? undefined,
        traffic_source: intakeType,
        properties_json: {
          intake_id: row.id,
          intake_type: intakeType,
          has_wizard_meta_v2: hasWizardV2,
        },
      });

      sendOpsTelegramAlertBestEffort(
        [
          "MyWave · новая заявка организатора (intake)",
          `id: ${row.id}`,
          `type: ${intakeType}`,
          hasWizardV2 ? "wizard: v2 (готово к draft-program)" : "wizard: legacy / без v2",
          row.discipline ? `discipline: ${row.discipline}` : null,
          row.region ? `region: ${row.region}` : null,
          "admin: /organizer-intakes",
        ]
          .filter(Boolean)
          .join("\n"),
      );

      res.status(201).json({ id: row.id, ok: true });
    } catch (e) {
      console.error("publicOrganizerIntake", e);
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code === "P2021") {
        res.status(503).json({
          error:
            "Таблица заявок отсутствует в БД. В каталоге services/api выполните: npx prisma migrate deploy",
        });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
