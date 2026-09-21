import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { TelegramUpdate } from "../telegram-platform/webhookHandler";

const STATE_ID = "main-bot";
const LEASE_MS = 90_000;
const OFFSET_RESET_AFTER_MS = 6 * 24 * 60 * 60 * 1000;

export async function acquireTelegramPollingLease(owner: string, now = new Date()): Promise<boolean> {
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  const claimed = await prisma.telegramPollingState.updateMany({
    where: {
      id: STATE_ID,
      OR: [{ leaseOwner: owner }, { leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: { leaseOwner: owner, leaseExpiresAt },
  });
  if (claimed.count === 1) return true;

  try {
    await prisma.telegramPollingState.create({
      data: { id: STATE_ID, leaseOwner: owner, leaseExpiresAt },
    });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return false;
  }
}

export async function renewTelegramPollingLease(owner: string, now = new Date()): Promise<boolean> {
  const renewed = await prisma.telegramPollingState.updateMany({
    where: { id: STATE_ID, leaseOwner: owner, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  });
  return renewed.count === 1;
}

export async function releaseTelegramPollingLease(owner: string): Promise<void> {
  await prisma.telegramPollingState.updateMany({
    where: { id: STATE_ID, leaseOwner: owner },
    data: { leaseOwner: null, leaseExpiresAt: null },
  });
}

export async function telegramPollingOffset(now = new Date()): Promise<number> {
  const state = await prisma.telegramPollingState.findUniqueOrThrow({
    where: { id: STATE_ID },
    select: { nextOffset: true, lastReceivedAt: true },
  });
  if (!state.lastReceivedAt || now.getTime() - state.lastReceivedAt.getTime() > OFFSET_RESET_AFTER_MS) {
    // Telegram may choose a new random update_id after a week without updates.
    return 0;
  }
  const offset = Number(state.nextOffset);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid Telegram polling offset");
  return offset;
}

export async function storeTelegramPollingUpdates(owner: string, updates: TelegramUpdate[], now = new Date()): Promise<void> {
  if (updates.length === 0) return;
  const maxId = Math.max(...updates.map((update) => update.update_id));
  if (!Number.isSafeInteger(maxId) || maxId < 0 || !Number.isSafeInteger(maxId + 1)) {
    throw new Error("Invalid Telegram update_id");
  }

  await prisma.$transaction(async (tx) => {
    const state = await tx.telegramPollingState.updateMany({
      where: { id: STATE_ID, leaseOwner: owner, leaseExpiresAt: { gt: now } },
      data: { nextOffset: BigInt(maxId + 1), lastReceivedAt: now },
    });
    if (state.count !== 1) throw new Error("Telegram polling lease lost before inbox write");
    await tx.telegramPollingUpdate.createMany({
      data: updates.map((update) => ({
        updateId: BigInt(update.update_id),
        payload: update as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  });
}

export async function pendingTelegramPollingUpdates(limit = 50): Promise<TelegramUpdate[]> {
  const rows = await prisma.telegramPollingUpdate.findMany({
    where: { status: "pending" },
    orderBy: { updateId: "asc" },
    take: limit,
    select: { updateId: true, payload: true },
  });
  return rows.map((row) => {
    if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
      throw new Error(`Telegram polling inbox payload missing for update ${row.updateId}`);
    }
    return row.payload as unknown as TelegramUpdate;
  });
}

export async function completeTelegramPollingUpdate(
  updateId: number,
  result: { contentOk: boolean; platformOk: boolean },
  now = new Date(),
): Promise<void> {
  const completed = await prisma.telegramPollingUpdate.updateMany({
    where: { updateId: BigInt(updateId), status: "pending" },
    data: {
      status: result.contentOk && result.platformOk ? "processed" : "failed",
      contentOk: result.contentOk,
      platformOk: result.platformOk,
      // Keep failed payloads briefly for an operator-led recovery; successful
      // updates should not retain a copy of personal message content.
      ...(result.contentOk && result.platformOk ? { payload: Prisma.DbNull } : {}),
      processedAt: now,
    },
  });
  if (completed.count !== 1) throw new Error("Telegram polling inbox completion was not unique");
}

export async function pruneTelegramPollingUpdates(now = new Date()): Promise<void> {
  await prisma.telegramPollingUpdate.deleteMany({
    where: {
      status: { in: ["processed", "failed"] },
      processedAt: { lt: new Date(now.getTime() - OFFSET_RESET_AFTER_MS) },
    },
  });
}
