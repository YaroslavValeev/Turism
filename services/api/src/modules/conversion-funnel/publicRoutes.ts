import type { Env } from "@mywave/config";
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";

export function conversionFunnelPublicRoutes(env: Env): Router {
  const router = Router();

  router.get("/conversion-funnel/unsubscribe", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const secret = (env.NOTIFICATIONS_TOKEN_SECRET || env.JWT_SECRET || "").trim();
    if (!token || !secret) {
      res.status(400).type("html").send("<!doctype html><html><body><p>Некорректная ссылка.</p></body></html>");
      return;
    }
    try {
      const payload = jwt.verify(token, secret) as { programId?: string; purpose?: string };
      if (payload.purpose !== "conversion_unsub" || !payload.programId) {
        throw new Error("bad token");
      }
      await prisma.programConversionState.updateMany({
        where: { programId: payload.programId },
        data: { serviceCommsOptIn: false },
      });
      res
        .type("html")
        .send(
          "<!doctype html><html><body><p>Сервисные сообщения по этой программе отключены.</p></body></html>",
        );
    } catch {
      res.status(400).type("html").send("<!doctype html><html><body><p>Ссылка устарела или некорректна.</p></body></html>");
    }
  });

  return router;
}
