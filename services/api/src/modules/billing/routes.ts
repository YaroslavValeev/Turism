import { Router, Request, Response } from "express";
import { type Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { isBillingStatementStatus, type BillingStatementStatus } from "@mywave/shared-types";
import { generateMonthlyStatement } from "./service";
import { writeAuditLog } from "../../lib/audit";

export function billingRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/statements", admin, async (req: Request, res: Response) => {
    const organizerId = req.query.organizerId as string | undefined;
    const list = await prisma.billingStatement.findMany({
      where: organizerId ? { organizerId } : {},
      include: { lines: true, organizer: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.post("/statements/generate", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      organizerId?: string;
      periodStart?: string;
      periodEnd?: string;
      status?: string;
      notes?: string;
    };
    if (!body.periodStart || !body.periodEnd) {
      res.status(400).json({ error: "periodStart and periodEnd are required" });
      return;
    }
    if (body.status && !isBillingStatementStatus(body.status)) {
      res.status(400).json({ error: "Invalid statement status" });
      return;
    }
    try {
      const statements = await generateMonthlyStatement(
        {
          organizerId: body.organizerId,
          periodStart: body.periodStart,
          periodEnd: body.periodEnd,
          status: body.status as BillingStatementStatus | undefined,
          notes: body.notes,
        },
        req.adminUserId ?? null
      );
      res.status(201).json(statements);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Statement generation failed" });
    }
  });

  router.patch("/statements/:id/status", admin, async (req: Request, res: Response) => {
    const body = req.body as { status?: string };
    if (!body.status || !isBillingStatementStatus(body.status)) {
      res.status(400).json({ error: "valid status required" });
      return;
    }
    const existing = await prisma.billingStatement.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const updated = await prisma.billingStatement.update({
      where: { id: req.params.id },
      data: {
        status: body.status,
        issuedAt: body.status === "invoiced" ? new Date() : existing.issuedAt,
        paidAt: body.status === "paid" ? new Date() : existing.paidAt,
      },
      include: { lines: true, organizer: { select: { id: true, displayName: true } } },
    });
    await writeAuditLog({
      entityType: "billing_statement",
      entityId: updated.id,
      changedField: "statement_status_change",
      oldValue: existing.status,
      newValue: updated.status,
      changedBy: req.adminUserId ?? null,
      reason: "manual statement status update",
    });
    res.json(updated);
  });

  return router;
}
