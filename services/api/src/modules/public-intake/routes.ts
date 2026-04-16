/**
 * Публичные заявки организаторов с лендинга (пилот). Без авторизации.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";

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

      if (intakeType === "program_submission") {
        const programTitle = String(b.programTitle ?? "").trim();
        if (!programTitle) {
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
          programTitle: b.programTitle != null ? String(b.programTitle).trim() || null : null,
          discipline: b.discipline != null ? String(b.discipline).trim() || null : null,
          region: b.region != null ? String(b.region).trim() || null : null,
          plannedDates: b.plannedDates != null ? String(b.plannedDates).trim() || null : null,
          message: b.message != null ? String(b.message).trim() || null : null,
          links: b.links != null ? String(b.links).trim() || null : null,
          meta:
            b.meta != null && typeof b.meta === "object" && !Array.isArray(b.meta)
              ? (b.meta as object)
              : undefined,
        },
      });

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
