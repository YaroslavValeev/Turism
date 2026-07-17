import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";

export type TelegramPlatformEventInput = {
  eventName: string;
  telegramUserId?: string | null;
  programId?: string | null;
  organizerId?: string | null;
  leadToken?: string | null;
  source?: string | null;
  campaign?: string | null;
  channelPostId?: string | null;
  properties?: Record<string, unknown>;
};

export async function logTelegramPlatformEvent(input: TelegramPlatformEventInput): Promise<void> {
  await prisma.telegramEventLog.create({
    data: {
      eventName: input.eventName,
      telegramUserId: input.telegramUserId ?? null,
      programId: input.programId ?? null,
      organizerId: input.organizerId ?? null,
      leadToken: input.leadToken ?? null,
      source: input.source ?? "telegram_bot",
      campaign: input.campaign ?? null,
      channelPostId: input.channelPostId ?? null,
      propertiesJson: (input.properties ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  emitBackendAnalyticsEventBestEffort({
    idempotency_key: `tg:${input.eventName}:${randomUUID()}`,
    event_name: input.eventName,
    event_version: 1,
    event_source: "backend",
    event_time: new Date().toISOString(),
    program_id: input.programId ?? undefined,
    organizer_id: input.organizerId ?? undefined,
    traffic_source: input.source ?? "telegram_bot",
    properties_json: {
      lead_token: input.leadToken ?? undefined,
      campaign: input.campaign ?? undefined,
      channel_post_id: input.channelPostId ?? undefined,
      telegram_user_id: input.telegramUserId ?? undefined,
      ...input.properties,
    },
  });
}
