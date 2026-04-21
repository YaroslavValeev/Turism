import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { notificationTokenSecret } from "../notifications/notificationTokens";
import { verifyUgcSubmitToken, verifyMyRewardsToken } from "./ugcTokens";

const MAX_MEDIA = 6;
const MAX_AUTHOR = 120;
const MAX_TEXT = 5000;

function sanitizeText(v: unknown, limit: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, limit);
}

function sanitizeMediaUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (!s) continue;
    // Минимальная проверка схемы: http/https.
    if (!/^https?:\/\//i.test(s)) continue;
    out.push(s.slice(0, 1024));
    if (out.length >= MAX_MEDIA) break;
  }
  return out;
}

export function ugcPublicRoutes(env: Env): Router {
  const router = Router();

  /**
   * Публичный submit UGC: требуется подписанный JWT-токен из письма.
   * Создаёт ProgramUgc в статусе moderation=pending и помечает request=submitted.
   */
  router.post("/program-ugc", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      token?: string;
      authorName?: string;
      textReview?: string;
      rating?: number | string;
      mediaUrls?: unknown;
      consentToPublish?: boolean;
      contactEmail?: string;
    };

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      res.status(400).json({ error: "token required" });
      return;
    }
    const secret = notificationTokenSecret(env);
    const decoded = verifyUgcSubmitToken(secret, token);
    if (!decoded) {
      res.status(400).json({ error: "invalid_or_expired_token" });
      return;
    }

    const authorName = sanitizeText(body.authorName, MAX_AUTHOR);
    const textReview = sanitizeText(body.textReview, MAX_TEXT);
    if (!authorName) {
      res.status(400).json({ error: "authorName required" });
      return;
    }
    if (!textReview) {
      res.status(400).json({ error: "textReview required" });
      return;
    }

    let rating: number | null = null;
    if (body.rating !== undefined && body.rating !== null && body.rating !== "") {
      const n = Number(body.rating);
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        res.status(400).json({ error: "rating must be 1..5" });
        return;
      }
      rating = Math.round(n);
    }

    const mediaUrls = sanitizeMediaUrls(body.mediaUrls);
    const consentToPublish = body.consentToPublish === true;
    if (!consentToPublish) {
      res.status(400).json({ error: "consentToPublish required" });
      return;
    }

    const contactEmail = sanitizeText(body.contactEmail, 320);

    const request = await prisma.programUgcRequest.findUnique({
      where: { id: decoded.requestId },
    });
    if (!request || request.bookingId !== decoded.bookingId || request.programId !== decoded.programId) {
      res.status(404).json({ error: "request not found" });
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: decoded.bookingId },
      select: { bookingStatus: true, organizerId: true, programId: true },
    });
    if (!booking) {
      res.status(404).json({ error: "booking not found" });
      return;
    }
    if (booking.bookingStatus !== "completed") {
      res.status(400).json({ error: "booking_not_completed" });
      return;
    }

    const alreadyUgc = await prisma.programUgc.findUnique({
      where: { bookingId: decoded.bookingId },
      select: { id: true, moderationStatus: true },
    });
    if (alreadyUgc) {
      res.status(200).json({
        ok: true,
        state: "already_submitted",
        moderationStatus: alreadyUgc.moderationStatus,
      });
      return;
    }

    const created = await prisma.programUgc.create({
      data: {
        programId: booking.programId,
        organizerId: booking.organizerId,
        bookingId: decoded.bookingId,
        authorName,
        contactEmail: contactEmail || null,
        textReview,
        rating,
        mediaUrls,
        consentToPublish,
        moderationStatus: "pending",
        source: "post_trip_request",
      },
    });

    await prisma.programUgcRequest.update({
      where: { id: request.id },
      data: { status: "submitted", submittedUgcId: created.id },
    });

    res.status(201).json({
      ok: true,
      state: "submitted",
      moderationStatus: created.moderationStatus,
    });
  });

  /**
   * Список approved UGC для карточки программы (публично).
   */
  router.get("/program-ugc", async (req: Request, res: Response) => {
    const programId = typeof req.query.programId === "string" ? req.query.programId.trim() : "";
    if (!programId) {
      res.status(400).json({ error: "programId required" });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 50);
    const rows = await prisma.programUgc.findMany({
      where: { programId, moderationStatus: "approved" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        authorName: true,
        textReview: true,
        rating: true,
        mediaUrls: true,
        createdAt: true,
      },
    });
    res.json(rows);
  });

  /**
   * Read-only «Мои бонусы» для пользователя.
   * Доступ — по signed JWT (purpose="my_rewards", TTL 7 дней). Токен встраивается
   * в письма (reward grant, recovery). Возвращает только rewards владельца токена.
   *
   * Безопасность:
   *   - токен с TTL ≤ 7 дней;
   *   - выборка строго по email/userId, зашитым в payload;
   *   - не отдаём sourceRefId/usedBookingId — только то, что нужно пользователю.
   */
  router.get("/my-rewards", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!token) {
      res.status(400).json({ error: "token required" });
      return;
    }
    const secret = notificationTokenSecret(env);
    const decoded = verifyMyRewardsToken(secret, token);
    if (!decoded) {
      res.status(400).json({ error: "invalid_or_expired_token" });
      return;
    }

    const ownerOr: Array<{ userId?: string } | { email?: { equals: string; mode: "insensitive" } }> = [];
    if (decoded.userId) ownerOr.push({ userId: decoded.userId });
    if (decoded.email) ownerOr.push({ email: { equals: decoded.email, mode: "insensitive" } });

    const rows = await prisma.userReward.findMany({
      where: { OR: ownerOr },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        valueType: true,
        value: true,
        currency: true,
        status: true,
        source: true,
        createdAt: true,
        usedAt: true,
        recoveredAt: true,
        recoveredCancellationKind: true,
        expiresAt: true,
      },
    });

    const now = Date.now();
    const available = rows.filter(
      (r) => r.status === "available" && (!r.expiresAt || r.expiresAt.getTime() > now),
    );
    const sumPercent = available
      .filter((r) => r.valueType === "percent")
      .reduce((s, r) => s + r.value, 0);
    const sumAmount = available
      .filter((r) => r.valueType === "amount")
      .reduce((s, r) => s + r.value, 0);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      owner: { email: decoded.email, userId: decoded.userId },
      rewards: rows,
      aggregates: {
        available_count: available.length,
        available_total_percent: sumPercent,
        available_total_amount_rub: sumAmount,
      },
    });
  });

  return router;
}
