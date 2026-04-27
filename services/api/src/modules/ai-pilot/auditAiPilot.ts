import { writeAuditLog } from "../../lib/audit";
import { randomUUID } from "node:crypto";

export async function logAiPilotAction(
  action: string,
  opts: { status: "ok" | "fallback" | "error"; model?: string; detail?: string; changedBy: string | null }
): Promise<string> {
  const id = randomUUID();
  await writeAuditLog({
    entityType: "ai_pilot",
    entityId: id,
    changedField: action,
    oldValue: null,
    newValue: JSON.stringify({
      model: opts.model ?? null,
      status: opts.status,
      detail: opts.detail?.slice(0, 2000) ?? null,
    }).slice(0, 4000),
    changedBy: opts.changedBy,
  });
  return id;
}
