/**
 * Единый путь смены publishStatus программы (админка HTTP + Telegram Admin).
 * Переход в published проходит canPublish; notify — только при * → published.
 */
import type { Env } from "@mywave/config";
import {
  isProgramPublishStatus,
  type ProgramPublishStatus,
} from "@mywave/shared-types";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { canPublish, programIncludeForPublishGate } from "./publishGate";
import { notifySubscribersOnProgramPublished } from "../subscriptions/notifier";

export type SetProgramPublishStatusResult =
  | {
      ok: true;
      program: Awaited<ReturnType<typeof prisma.program.update>>;
      notified: boolean;
      alreadyPublished: boolean;
    }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "invalid_status"; allowed: string }
  | { ok: false; error: "gate"; missing: string[] };

const ALLOWED_LIST =
  "draft,internal_review,needs_fix,approved,published,paused,archived";

export async function setProgramPublishStatus(
  env: Env,
  input: {
    programId: string;
    publishStatus: string;
    actorId: string | null;
    reason?: string;
  },
): Promise<SetProgramPublishStatusResult> {
  const existing = await prisma.program.findUnique({
    where: { id: input.programId },
    include: programIncludeForPublishGate,
  });
  if (!existing) {
    return { ok: false, error: "not_found" };
  }
  if (!isProgramPublishStatus(input.publishStatus)) {
    return { ok: false, error: "invalid_status", allowed: ALLOWED_LIST };
  }
  const target = input.publishStatus as ProgramPublishStatus;
  const alreadyPublished = existing.publishStatus === "published" && target === "published";

  if (target === "published" && !alreadyPublished) {
    const gate = canPublish(existing);
    if (!gate.ok) {
      return { ok: false, error: "gate", missing: gate.missing };
    }
  }

  const program = await prisma.program.update({
    where: { id: existing.id },
    data: { publishStatus: target },
    include: { media: true },
  });

  await writeAuditLog({
    entityType: "program",
    entityId: program.id,
    changedField: "publish_status_change",
    oldValue: existing.publishStatus,
    newValue: program.publishStatus,
    changedBy: input.actorId,
    reason: input.reason ?? "publish workflow",
  });

  let notified = false;
  if (existing.publishStatus !== "published" && program.publishStatus === "published") {
    void notifySubscribersOnProgramPublished(env, {
      id: program.id,
      title: program.title,
      discipline: program.discipline,
      region: program.region,
      startDate: program.startDate,
    });
    notified = true;
  }

  return { ok: true, program, notified, alreadyPublished };
}
