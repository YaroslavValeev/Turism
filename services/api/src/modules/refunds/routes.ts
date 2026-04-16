import { Router, Request, Response } from "express";
import { type Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { isRefundStatus, type RefundStatus } from "@mywave/shared-types";
import { recordRefund } from "../billing/service";

export function refundsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (req: Request, res: Response) => {
    const bookingId = req.query.bookingId as string | undefined;
    const list = await prisma.refund.findMany({
      where: bookingId ? { bookingId } : {},
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.post("/", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      bookingId?: string;
      paymentId?: string;
      amountRub?: number;
      status?: string;
      refundedAt?: string;
      reason?: string;
      externalReference?: string;
    };
    if (!body.bookingId || body.amountRub == null) {
      res.status(400).json({ error: "bookingId and amountRub are required" });
      return;
    }
    if (body.status && !isRefundStatus(body.status)) {
      res.status(400).json({ error: "Invalid refund status" });
      return;
    }
    try {
      const result = await recordRefund(
        {
          bookingId: body.bookingId,
          paymentId: body.paymentId,
          amountRub: Number(body.amountRub),
          status: body.status as RefundStatus | undefined,
          refundedAt: body.refundedAt,
          reason: body.reason,
          externalReference: body.externalReference,
        },
        req.adminUserId ?? null
      );
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Refund failed" });
    }
  });

  return router;
}
