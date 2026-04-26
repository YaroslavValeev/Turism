import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import {
  generateOrganizerOutreachCampaigns,
  sendOutreachEmailForCampaign,
  approveOutreachCampaign,
  skipOutreachCampaign,
  declineOutreachCampaign,
  rewriteOutreachToDraft,
  submitOutreachForReview,
  approveAndSendOutreachCampaign,
} from "./service";
import { safeError } from "../../lib/safeLogger";

function actor(req: Request): string | null {
  return (req as Request & { adminUserId?: string }).adminUserId ?? null;
}

export function organizerOutreachRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/campaigns", admin, async (req: Request, res: Response) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const list = await prisma.organizerOutreachCampaign.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { organizer: { select: { displayName: true, contactEmail: true } } },
    });
    res.json({ campaigns: list });
  });

  router.get("/campaigns/:id", admin, async (req: Request, res: Response) => {
    const c = await prisma.organizerOutreachCampaign.findUnique({
      where: { id: req.params.id },
      include: { organizer: { select: { id: true, displayName: true, contactEmail: true } } },
    });
    if (!c) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(c);
  });

  router.post("/campaigns/:id/approve", admin, async (req: Request, res: Response) => {
    try {
      await approveOutreachCampaign(req.params.id, actor(req));
      res.json({ ok: true });
    } catch (e) {
      safeError("outreach.approve", e);
      res.status(400).json({ error: "failed" });
    }
  });

  router.post("/campaigns/:id/send", admin, async (req: Request, res: Response) => {
    const r = await sendOutreachEmailForCampaign(env, req.params.id, actor(req));
    if (!r.ok) {
      res.status(400).json({ error: r.error });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/campaigns/:id/approve-and-send", admin, async (req: Request, res: Response) => {
    const r = await approveAndSendOutreachCampaign(env, req.params.id, actor(req));
    if (!r.ok) {
      res.status(400).json({ error: r.error });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/campaigns/:id/skip", admin, async (req: Request, res: Response) => {
    await skipOutreachCampaign(req.params.id, actor(req));
    res.json({ ok: true });
  });

  router.post("/campaigns/:id/decline", admin, async (req: Request, res: Response) => {
    await declineOutreachCampaign(req.params.id, actor(req));
    res.json({ ok: true });
  });

  router.post("/campaigns/:id/submit-for-review", admin, async (req: Request, res: Response) => {
    const r = await submitOutreachForReview(req.params.id, actor(req));
    if (!r.ok) {
      res.status(400).json({ error: r.error });
      return;
    }
    res.json({ ok: true });
  });

  router.patch("/campaigns/:id", admin, async (req: Request, res: Response) => {
    const b = req.body as { emailSubject?: string; emailBody?: string };
    if (typeof b.emailSubject !== "string" || typeof b.emailBody !== "string") {
      res.status(400).json({ error: "emailSubject, emailBody required" });
      return;
    }
    await rewriteOutreachToDraft(
      req.params.id,
      { emailSubject: b.emailSubject, emailBody: b.emailBody },
      actor(req)
    );
    res.json({ ok: true });
  });

  /**
   * AI: только переформулирует при сохранённых цифрах; метрики подставляются с сервера, не с модели.
   */
  router.post("/campaigns/:id/ai-suggest-body", admin, async (req: Request, res: Response) => {
    if (!env.OPENAI_API_KEY?.trim()) {
      res.status(503).json({ error: "OPENAI_API_KEY not set" });
      return;
    }
    const c = await prisma.organizerOutreachCampaign.findUnique({
      where: { id: req.params.id },
      include: { organizer: { select: { displayName: true } } },
    });
    if (!c) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const tone = typeof req.body?.tone === "string" ? req.body.tone : "дружелюбный, короткие фразы";
    const metricsBlock = `Просмотры: ${c.viewsCount}. Переходы: ${c.clicksCount}. Заявки: ${c.leadsCount}. Брони: ${c.dealsCount}. Сумма сделок (₽): ${c.dealAmountTotal}. Тип: ${c.templateType}.`;
    const rj = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Ты редактор писем для организаторов MyWave. Не меняй и не выдумывай цифры. Используй ровно переданные числа. Русский язык.",
          },
          {
            role: "user",
            content: `Переформулируй письмо, тон: ${tone}.\n\nМетрики (канон, не трогать): ${metricsBlock}\n\nТема: ${c.emailSubject}\n\nТекст:\n${c.emailBody}`,
          },
        ],
        temperature: 0.3,
      }),
    });
    if (!rj.ok) {
      res.status(502).json({ error: "openai", detail: await rj.text() });
      return;
    }
    const completion = (await rj.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      res.status(500).json({ error: "empty completion" });
      return;
    }
    res.json({ body: text });
  });

  router.post("/run-generate", admin, async (req: Request, res: Response) => {
    const r = await generateOrganizerOutreachCampaigns(env, actor(req));
    res.json(r);
  });

  return router;
}
