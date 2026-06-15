import { prisma } from "../../lib/prisma";

export function parseOpsAllowlist(envValue: string | undefined): Set<string> {
  const raw = (envValue ?? "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isOpsTelegramId(telegramAccountId: bigint | number, allowlist: Set<string>): boolean {
  return allowlist.has(String(telegramAccountId));
}

export async function getOpsDashboardSnapshot() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [leadsToday, staleLeads, noStatusLeads, moderationPending] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: startOfDay }, source: "telegram" } }),
    prisma.lead.count({
      where: {
        source: "telegram",
        sentToOrganizerAt: { not: null, lte: since24h },
        organizerFirstResponseAt: null,
      },
    }),
    prisma.lead.count({
      where: { source: "telegram", leadStatus: "new", sentToOrganizerAt: { not: null } },
    }),
    prisma.contentItem.count({
      where: { workflowStatus: { in: ["pending_owner_review", "draft"] } },
    }),
  ]);

  return {
    leadsToday,
    staleLeadsOver24h: staleLeads,
    leadsWithoutOrganizerResponse: noStatusLeads,
    contentItemsPendingReview: moderationPending,
  };
}
