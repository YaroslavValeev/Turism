import { Router, Request, Response } from "express";
import { type Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { isPaymentStatus, type PaymentStatus } from "@mywave/shared-types";
import { recordPayment } from "../billing/service";

export function paymentsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (req: Request, res: Response) => {
    const bookingId = req.query.bookingId as string | undefined;
    const list = await prisma.payment.findMany({
      where: bookingId ? { bookingId } : {},
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.post("/", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      bookingId?: string;
      amountRub?: number;
      status?: string;
      paymentKind?: "partial" | "full";
      paidAt?: string;
      externalReference?: string;
      paymentMethod?: string;
      notes?: string;
    };
    if (!body.bookingId || body.amountRub == null) {
      res.status(400).json({ error: "bookingId and amountRub are required" });
      return;
    }
    if (body.status && !isPaymentStatus(body.status)) {
      res.status(400).json({ error: "Invalid payment status" });
      return;
    }
    try {
      const result = await recordPayment(
        {
          bookingId: body.bookingId,
          amountRub: Number(body.amountRub),
          status: body.status as PaymentStatus | undefined,
          paymentKind: body.paymentKind,
          paidAt: body.paidAt,
          externalReference: body.externalReference,
          paymentMethod: body.paymentMethod,
          notes: body.notes,
        },
        req.adminUserId ?? null
      );
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Payment failed" });
    }
  });

  return router;
}
