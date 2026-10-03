import { prisma } from "../../lib/prisma";
import { safeError, safeLog } from "../../lib/safeLogger";
import { randomUUID } from "node:crypto";

/** Atomic claim prevents concurrent/replayed publication from sending twice per channel. */
export async function deliverSubscriptionOnce(subscriptionId: string, programId: string, channel: "email" | "telegram", send: () => Promise<boolean>): Promise<"sent" | "skipped" | "uncertain"> {
  const id = randomUUID();
  // ON CONFLICT DO NOTHING avoids expected duplicate claims appearing as prisma:error.
  const claim = await prisma.subscriptionDelivery.createMany({ data: { id, subscriptionId, programId, channel }, skipDuplicates: true });
  if (claim.count === 0) return "skipped";
  let sent = false;
  try { sent = await send(); } catch (error) { safeError("[subscriptions] delivery attempt failed", error); }
  // Sending may have succeeded before a timeout. Do not blindly retry an ambiguous provider result.
  await prisma.subscriptionDelivery.update({ where: { id }, data: { status: sent ? "sent" : "uncertain", completedAt: new Date() } });
  safeLog("[subscriptions] delivery result", { deliveryId: id, channel, status: sent ? "sent" : "uncertain" });
  return sent ? "sent" : "uncertain";
}
