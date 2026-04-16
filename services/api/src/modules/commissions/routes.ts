/**
 * Commission/reconciliation foundation. Admin-only. Auditable. No revenue UI.
 * Source: commission_data_contract, canonical_status_models (reconciliation_status).
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import { isCommissionReconciliationStatus } from "@mywave/shared-types";
import type { Env } from "@mywave/config";
import { recalculateCommissionForBooking } from "../billing/service";

export function commissionsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (req: Request, res: Response) => {
    const status = req.query.reconciliation_status as string | undefined;
    const bookingId = req.query.bookingId as string | undefined;
    const where: { reconciliationStatus?: string; bookingId?: string } = {};
    if (status && isCommissionReconciliationStatus(status)) where.reconciliationStatus = status;
    if (bookingId) where.bookingId = bookingId;
    const list = await prisma.commission.findMany({
      where,
      include: {
        booking: { select: { id: true, bookingStatus: true, completedAt: true } },
        organizer: { select: { id: true, displayName: true } },
        program: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
    const c = await prisma.commission.findUnique({
      where: { id: req.params.id },
      include: { booking: true, organizer: { select: { id: true, displayName: true, contactEmail: true } }, program: { select: { id: true, title: true } } },
    });
    if (!c) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(c);
  });

  router.post("/", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      bookingId: string;
      organizerId: string;
      programId: string;
      gmvRub: number;
      commissionRatePct?: number;
      commissionFixedRub?: number;
      commissionAccruedRub?: number;
      reconciliationStatus?: string;
      invoiceStatus?: string;
      paymentDueDate?: string;
    };
    if (!body.bookingId || !body.organizerId || !body.programId || body.gmvRub == null) {
      res.status(400).json({ error: "bookingId, organizerId, programId, gmvRub required" });
      return;
    }
    const booking = await prisma.booking.findUnique({ where: { id: body.bookingId } });
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.bookingStatus !== "completed") {
      res.status(400).json({
        error: "Commission can only be created for completed booking",
        bookingStatus: booking.bookingStatus,
      });
      return;
    }
    const existingCommission = await prisma.commission.findFirst({ where: { bookingId: body.bookingId } });
    if (existingCommission) {
      res.status(409).json({
        error: "Commission already exists for this booking",
        commissionId: existingCommission.id,
      });
      return;
    }
    const status =
      body.reconciliationStatus && isCommissionReconciliationStatus(body.reconciliationStatus)
        ? body.reconciliationStatus
        : "pending_evidence";
    const accrued = body.commissionAccruedRub ?? Math.round((body.gmvRub * (body.commissionRatePct ?? 0)) / 100) + (body.commissionFixedRub ?? 0);
    const c = await prisma.commission.create({
      data: {
        bookingId: body.bookingId,
        organizerId: body.organizerId,
        programId: body.programId,
        gmvRub: Number(body.gmvRub),
        commissionRatePct: body.commissionRatePct ?? null,
        commissionFixedRub: body.commissionFixedRub ?? null,
        commissionAccruedRub: accrued,
        commissionCollectedRub: null,
        reconciliationStatus: status,
        invoiceStatus: body.invoiceStatus ?? null,
        paymentDueDate: body.paymentDueDate ? new Date(body.paymentDueDate) : null,
        paymentReceivedDate: null,
      },
      include: { booking: { select: { id: true } }, organizer: { select: { displayName: true } }, program: { select: { title: true } } },
    });
    await writeAuditLog({
      entityType: "commission",
      entityId: c.id,
      changedField: "commission_created",
      oldValue: null,
      newValue: status,
      changedBy: req.adminUserId ?? null,
      reason: "commission accrual",
    });
    res.status(201).json(c);
  });

  router.patch("/:id/reconciliation", admin, async (req: Request, res: Response) => {
    const existing = await prisma.commission.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body as {
      reconciliationStatus?: string;
      commissionCollectedRub?: number;
      invoiceStatus?: string;
      paymentReceivedDate?: string;
    };
    const reconciliationStatus =
      body.reconciliationStatus && isCommissionReconciliationStatus(body.reconciliationStatus) ? body.reconciliationStatus : undefined;
    const data: {
      reconciliationStatus?: string;
      commissionCollectedRub?: number | null;
      invoiceStatus?: string | null;
      paymentReceivedDate?: Date | null;
    } = {};
    if (reconciliationStatus) data.reconciliationStatus = reconciliationStatus;
    if (body.commissionCollectedRub != null) data.commissionCollectedRub = body.commissionCollectedRub;
    if (body.invoiceStatus !== undefined) data.invoiceStatus = body.invoiceStatus || null;
    if (body.paymentReceivedDate !== undefined) data.paymentReceivedDate = body.paymentReceivedDate ? new Date(body.paymentReceivedDate) : null;
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }
    const c = await prisma.commission.update({
      where: { id: req.params.id },
      data,
      include: { booking: { select: { id: true } }, organizer: { select: { displayName: true } }, program: { select: { title: true } } },
    });
    if (reconciliationStatus) {
      await writeAuditLog({
        entityType: "commission",
        entityId: c.id,
        changedField: "commission_reconciliation_change",
        oldValue: existing.reconciliationStatus,
        newValue: c.reconciliationStatus,
        changedBy: req.adminUserId ?? null,
        reason: "reconciliation update",
      });
    }
    res.json(c);
  });

  router.post("/:id/recalculate", admin, async (req: Request, res: Response) => {
    const existing = await prisma.commission.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const commission = await recalculateCommissionForBooking(existing.bookingId, req.adminUserId ?? null);
      res.json(commission);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Recalculation failed" });
    }
  });

  return router;
}
