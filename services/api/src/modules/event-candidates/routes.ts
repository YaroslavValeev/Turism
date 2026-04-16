import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import { isEventCandidateStatus } from "../ingestion/constants";
import {
  approveCandidate,
  mergeCandidateIntoCanonical,
  publishCandidateToDraft,
  rejectCandidate,
} from "../ingestion/service";

export function eventCandidatesRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (req: Request, res: Response) => {
    const { status, sourceId, groupId } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (status) {
      if (!isEventCandidateStatus(status)) {
        res.status(400).json({ error: "invalid status" });
        return;
      }
      where.status = status;
    }
    if (sourceId) where.normalizedItem = { rawItem: { sourceId } };
    if (groupId) where.groupId = groupId;

    const candidates = await prisma.eventCandidate.findMany({
      where,
      include: {
        dedupGroup: true,
        publishedProgram: {
          include: {
            program: {
              select: {
                id: true,
                title: true,
                publishStatus: true,
              },
            },
          },
        },
        normalizedItem: {
          include: {
            rawItem: {
              include: {
                source: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    trustScore: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ finalScore: "desc" }, { reviewPriority: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    res.json(candidates);
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
    const candidate = await prisma.eventCandidate.findUnique({
      where: { id: req.params.id },
      include: {
        dedupGroup: {
          include: {
            candidates: {
              include: {
                normalizedItem: {
                  include: {
                    rawItem: {
                      include: {
                        source: true,
                      },
                    },
                  },
                },
              },
              orderBy: [{ finalScore: "desc" }, { createdAt: "asc" }],
            },
          },
        },
        publishedProgram: {
          include: {
            program: true,
          },
        },
        normalizedItem: {
          include: {
            rawItem: {
              include: {
                source: true,
              },
            },
          },
        },
      },
    });

    if (!candidate) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(candidate);
  });

  router.post("/:id/approve", admin, async (req: Request, res: Response) => {
    try {
      const candidate = await approveCandidate(
        req.params.id,
        req.adminUserId ?? null,
        typeof req.body?.notes === "string" ? req.body.notes : null,
      );
      res.json(candidate);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Approve failed" });
    }
  });

  router.post("/:id/reject", admin, async (req: Request, res: Response) => {
    try {
      const candidate = await rejectCandidate(
        req.params.id,
        req.adminUserId ?? null,
        typeof req.body?.notes === "string" ? req.body.notes : null,
      );
      res.json(candidate);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Reject failed" });
    }
  });

  router.post("/:id/merge", admin, async (req: Request, res: Response) => {
    const canonicalCandidateId =
      typeof req.body?.canonicalCandidateId === "string" ? req.body.canonicalCandidateId : "";
    if (!canonicalCandidateId) {
      res.status(400).json({ error: "canonicalCandidateId is required" });
      return;
    }
    try {
      const candidate = await mergeCandidateIntoCanonical(
        req.params.id,
        canonicalCandidateId,
        req.adminUserId ?? null,
        typeof req.body?.notes === "string" ? req.body.notes : null,
      );
      res.json(candidate);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Merge failed" });
    }
  });

  router.post("/:id/publish", admin, async (req: Request, res: Response) => {
    try {
      const result = await publishCandidateToDraft(
        req.params.id,
        req.adminUserId ?? null,
        typeof req.body?.editorNotes === "string" ? req.body.editorNotes : null,
      );
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Publish failed" });
    }
  });

  return router;
}
