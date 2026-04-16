/**
 * Audit log writer. Source of truth: audit_log_spec.md
 * Depth: actor (changedBy), entity_type, entity_id, action (changedField), timestamp (createdAt), metadata/diff (oldValue, newValue).
 */
import { prisma } from "./prisma";

export interface AuditEntry {
  entityType: string;
  entityId: string;
  /** Action name, e.g. verification_status_change, publish_status_change */
  changedField: string;
  oldValue: string | null;
  newValue: string | null;
  /** Actor (admin user id or system) */
  changedBy: string | null;
  reason?: string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      changedField: entry.changedField,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      changedBy: entry.changedBy,
      reason: entry.reason ?? null,
    },
  });
}
