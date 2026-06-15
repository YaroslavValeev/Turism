import { prisma } from "../../lib/prisma";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";
import { parseDeeplinkPayload, type ParsedDeeplink } from "./deeplink";
import { logTelegramPlatformEvent } from "./events";

export async function validateAndRecordDeeplink(input: {
  payload: string;
  telegramUserId?: string;
  campaign?: string;
}): Promise<{ ok: boolean; parsed: ParsedDeeplink; programId?: string; leadToken?: string }> {
  const parsed = parseDeeplinkPayload(input.payload);
  if (!parsed) {
    return { ok: false, parsed: { kind: "unknown", raw: "" } };
  }

  let programId: string | undefined;
  let leadToken: string | undefined;

  if (parsed.programId || parsed.kind === "apply") {
    const pid = parsed.programId;
    if (!pid) return { ok: false, parsed };
    const program = await prisma.program.findUnique({
      where: { id: pid },
      select: { id: true, publishStatus: true },
    });
    if (!program || !isProgramPubliclyVisible(program)) {
      return { ok: false, parsed };
    }
    programId = program.id;
  }

  if (parsed.kind === "lead" && parsed.leadToken) {
    const lead = await prisma.lead.findUnique({
      where: { leadToken: parsed.leadToken },
      select: { leadToken: true, programId: true },
    });
    if (!lead) return { ok: false, parsed };
    leadToken = lead.leadToken ?? undefined;
    programId = lead.programId;
  }

  await prisma.telegramDeepLinkOpen.create({
    data: {
      telegramUserId: input.telegramUserId ?? null,
      payload: parsed.raw,
      payloadKind: parsed.kind,
      programId: programId ?? null,
      leadToken: leadToken ?? parsed.leadToken ?? null,
      sourcePostId: parsed.channelPostId ?? null,
      campaign: input.campaign ?? null,
    },
  });

  await logTelegramPlatformEvent({
    eventName: "deeplink_opened",
    telegramUserId: input.telegramUserId ?? null,
    programId: programId ?? null,
    leadToken: leadToken ?? parsed.leadToken ?? null,
    channelPostId: parsed.channelPostId ?? null,
    campaign: input.campaign ?? null,
    properties: { kind: parsed.kind },
  });

  return { ok: parsed.kind !== "unknown", parsed, programId, leadToken };
}
