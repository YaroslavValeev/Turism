/**
 * PR2: backfill Source.externalChannelId из legacy metaJson.channelId / channel_id.
 * Dry-run по умолчанию; запись только при SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED и mode=apply.
 */
import type { PrismaClient } from "@prisma/client";
import type { Env } from "@mywave/config";

export type LinkageBackfillRowStatus =
  | "no_meta_channel_id"
  | "channel_not_found"
  | "organizer_mismatch"
  | "would_link"
  | "duplicate_would_link"
  | "channel_already_linked_elsewhere";

export type LinkageBackfillRow = {
  sourceId: string;
  organizerId: string | null;
  metaChannelId: string | null;
  proposedExternalChannelId: string | null;
  status: LinkageBackfillRowStatus;
  /** Кратко для отчёта / manual review */
  detail?: string;
};

export type LinkageBackfillSummary = {
  scanned: number;
  no_meta_channel_id: number;
  channel_not_found: number;
  organizer_mismatch: number;
  would_link: number;
  duplicate_would_link: number;
  channel_already_linked_elsewhere: number;
  /** Запись возможна только для would_link после всех проверок */
  applyable: number;
};

export type LinkageBackfillReport = {
  mode: "dry_run" | "apply";
  writeEnabled: boolean;
  organizerScope: string | null;
  summary: LinkageBackfillSummary;
  rows: LinkageBackfillRow[];
  appliedCount?: number;
};

export function extractMetaChannelId(metaJson: unknown): string | null {
  if (!metaJson || typeof metaJson !== "object" || Array.isArray(metaJson)) return null;
  const o = metaJson as Record<string, unknown>;
  const raw = o.channelId ?? o.channel_id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length ? id : null;
}

type ChannelStub = { id: string; organizerId: string };

/** Вызывается только для записей с `externalChannelId === null` (legacy scope PR2). */
export function classifyLinkageRow(
  source: { id: string; organizerId: string | null; metaJson: unknown },
  channelById: Map<string, ChannelStub>,
): Omit<LinkageBackfillRow, "detail"> & { detail?: string } {
  const metaChannelId = extractMetaChannelId(source.metaJson);
  if (!metaChannelId) {
    return {
      sourceId: source.id,
      organizerId: source.organizerId,
      metaChannelId: null,
      proposedExternalChannelId: null,
      status: "no_meta_channel_id",
    };
  }
  const ch = channelById.get(metaChannelId);
  if (!ch) {
    return {
      sourceId: source.id,
      organizerId: source.organizerId,
      metaChannelId,
      proposedExternalChannelId: null,
      status: "channel_not_found",
      detail: "orphaned_meta_reference",
    };
  }
  if (source.organizerId && source.organizerId !== ch.organizerId) {
    return {
      sourceId: source.id,
      organizerId: source.organizerId,
      metaChannelId,
      proposedExternalChannelId: ch.id,
      status: "organizer_mismatch",
    };
  }
  return {
    sourceId: source.id,
    organizerId: source.organizerId,
    metaChannelId,
    proposedExternalChannelId: ch.id,
    status: "would_link",
  };
}

/** Несколько кандидатов с null FK на один и тот же канал — только manual review, без авто-apply. */
export function markDuplicateWouldLink(rows: LinkageBackfillRow[]): LinkageBackfillRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "would_link" || !r.proposedExternalChannelId) continue;
    const k = r.proposedExternalChannelId;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    if (r.status !== "would_link" || !r.proposedExternalChannelId) return r;
    if ((counts.get(r.proposedExternalChannelId) ?? 0) > 1) {
      return {
        ...r,
        status: "duplicate_would_link" as const,
        detail: "multiple_sources_same_channel_meta",
      };
    }
    return r;
  });
}

/** Другой Source уже держит этот externalChannelId — не перетираем без ручного слияния. */
export function markChannelAlreadyLinkedElsewhere(
  rows: LinkageBackfillRow[],
  holdersByChannel: Map<string, string[]>,
): LinkageBackfillRow[] {
  return rows.map((r) => {
    if (r.status !== "would_link" || !r.proposedExternalChannelId) return r;
    const holders = holdersByChannel.get(r.proposedExternalChannelId) ?? [];
    const others = holders.filter((id) => id !== r.sourceId);
    if (others.length === 0) return r;
    return {
      ...r,
      status: "channel_already_linked_elsewhere" as const,
      detail: `held_by_source_ids:${others.join(",")}`,
    };
  });
}

function summarize(rows: LinkageBackfillRow[]): LinkageBackfillSummary {
  const keys: LinkageBackfillRowStatus[] = [
    "no_meta_channel_id",
    "channel_not_found",
    "organizer_mismatch",
    "would_link",
    "duplicate_would_link",
    "channel_already_linked_elsewhere",
  ];
  const summary = {
    scanned: rows.length,
    no_meta_channel_id: 0,
    channel_not_found: 0,
    organizer_mismatch: 0,
    would_link: 0,
    duplicate_would_link: 0,
    channel_already_linked_elsewhere: 0,
    applyable: 0,
  };
  for (const r of rows) {
    summary[r.status]++;
  }
  summary.applyable = summary.would_link;
  return summary;
}

export async function runLinkageBackfillReport(
  db: PrismaClient,
  env: Env,
  options: {
    mode: "dry_run" | "apply";
    organizerId?: string | null;
    changedBy: string | null;
  },
): Promise<LinkageBackfillReport> {
  const organizerScope = options.organizerId?.trim() || null;
  const where = organizerScope ? { organizerId: organizerScope } : {};

  const sources = await db.source.findMany({
    where,
    select: {
      id: true,
      organizerId: true,
      metaJson: true,
    },
  });

  /** В текущей схеме БД нет `OrganizerExternalChannel` — резолв meta.channelId в FK отключён. */
  const channelById = new Map<string, ChannelStub>();

  const scoped = sources.filter((s) => extractMetaChannelId(s.metaJson));
  let rows: LinkageBackfillRow[] = scoped.map((s) => {
    const base = classifyLinkageRow(
      { id: s.id, organizerId: s.organizerId, metaJson: s.metaJson },
      channelById,
    );
    const { detail, ...rest } = base;
    return {
      ...rest,
      detail: base.status === "channel_not_found" ? "organizer_external_channel_not_in_schema" : detail,
    };
  });

  rows = markDuplicateWouldLink(rows);
  rows = markChannelAlreadyLinkedElsewhere(rows, new Map());

  const summary = summarize(rows);
  const writeEnabled = env.SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED;

  if (options.mode === "apply") {
    if (!writeEnabled) {
      throw new Error("apply_requires_SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED");
    }
    /** Пока нет таблицы каналов, apply не выполняет записи (would_link не возникает). */
    return {
      mode: "apply",
      writeEnabled: true,
      organizerScope,
      summary,
      rows,
      appliedCount: 0,
    };
  }

  return {
    mode: "dry_run",
    writeEnabled,
    organizerScope,
    summary,
    rows,
  };
}
