import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import {
  SOURCE_LIFECYCLE,
  SOURCE_ORIGIN,
  normalizeSourceUrlOrHandle,
  pauseContractAutoSources,
  upsertSourceByTypeAndHandle,
} from "./sourceRegistry";

type SyncActor = { adminUserId?: string | null; reason?: string };

function parserProfileForType(type: string): string {
  switch (type) {
    case "telegram":
      return "telegram_channel";
    case "instagram":
      return "instagram_public_profile";
    case "vk":
      return "vk_public_page";
    case "rss":
      return "rss_feed";
    case "site":
      return "site_html";
    default:
      return "generic_external_source";
  }
}

export async function syncOrganizerContractAutoSources(db: PrismaClient, organizerId: string, actor?: SyncActor) {
  const organizer = await db.organizer.findUnique({
    where: { id: organizerId },
    select: { id: true, displayName: true, telegramChatId: true },
  });
  if (!organizer) return { createdOrUpdated: 0, paused: 0 };

  const latestContract = await db.organizerContract.findFirst({
    where: { organizerId },
    orderBy: { updatedAt: "desc" },
    select: { status: true, id: true },
  });
  const contractSigned = latestContract?.status === "signed";
  if (!contractSigned) {
    const paused = await pauseContractAutoSources(db, organizerId);
    return { createdOrUpdated: 0, paused: paused.count };
  }

  const channels = await db.organizerExternalChannel.findMany({
    where: { organizerId, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const syntheticTelegram =
    organizer.telegramChatId && organizer.telegramChatId.trim()
      ? [
          {
            id: "synthetic_telegram",
            type: "telegram",
            urlOrHandle: organizer.telegramChatId.trim(),
            parserProfile: "telegram_channel",
            fetchIntervalMinutes: 1440,
            isActive: true,
            autoPublish: false,
            metaJson: { source: "organizer.telegramChatId" },
          },
        ]
      : [];

  const allChannels = [...channels, ...syntheticTelegram];
  let changed = 0;
  for (const channel of allChannels) {
    const normalized = normalizeSourceUrlOrHandle(channel.type, channel.urlOrHandle);
    if (!normalized) continue;
    const syntheticChannel = channel.id === "synthetic_telegram";
    await upsertSourceByTypeAndHandle(db, {
      type: channel.type,
      name: `${organizer.displayName} · ${channel.type}`,
      urlOrHandle: normalized,
      organizerId,
      parserProfile: channel.parserProfile || parserProfileForType(channel.type),
      fetchIntervalMinutes: channel.fetchIntervalMinutes || 1440,
      isActive: channel.isActive !== false,
      sourceOrigin: SOURCE_ORIGIN.CONTRACT_AUTO,
      lifecycleState: SOURCE_LIFECYCLE.ACTIVE,
      autoPublish: false,
      externalChannelId: syntheticChannel ? null : channel.id,
      metaJson: {
        sourceOrigin: SOURCE_ORIGIN.CONTRACT_AUTO,
        autoPublish: false,
        autoAddedAt: new Date().toISOString(),
        autoAddedBy: actor?.adminUserId ?? "system_contract_auto_onboarding",
        channelId: channel.id,
        reason: actor?.reason ?? "contract_signed",
      },
    });
    changed += 1;
    if (!syntheticChannel && "lastSyncedAt" in channel) {
      await db.organizerExternalChannel.update({
        where: { id: channel.id },
        data: { lastSyncedAt: new Date() },
      }).catch(() => {});
    }
  }

  if (changed > 0) {
    await writeAuditLog({
      entityType: "organizer",
      entityId: organizerId,
      changedField: "contract_auto_sources_synced",
      oldValue: null,
      newValue: String(changed),
      changedBy: actor?.adminUserId ?? null,
      reason: actor?.reason ?? "contract_signed",
    });
  }

  return { createdOrUpdated: changed, paused: 0 };
}

