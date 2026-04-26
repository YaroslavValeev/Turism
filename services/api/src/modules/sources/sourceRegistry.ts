import type { Prisma, PrismaClient } from "@prisma/client";

export const SOURCE_ORIGIN = {
  MANUAL: "manual",
  CONTRACT_AUTO: "organizer_contract_auto",
  BATCH_IMPORT: "batch_import",
  LEGACY: "legacy",
} as const;

/** Канонические значения lifecycle (см. ADR-009). Синоним продукта manual_only = manual_override. */
export const SOURCE_LIFECYCLE = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PAUSED_BY_POLICY: "paused_by_policy",
  MANUAL_OVERRIDE: "manual_override",
  ARCHIVED: "archived",
} as const;

/** Не переводить в paused_by_policy при потере договора (contract-auto источники). */
export function isLifecycleProtectedFromContractPolicyPause(lifecycleState: string | null | undefined): boolean {
  const s = String(lifecycleState ?? "").trim();
  return s === SOURCE_LIFECYCLE.MANUAL_OVERRIDE || s === SOURCE_LIFECYCLE.ARCHIVED;
}

export const EXTERNAL_CHANNEL_TYPES = ["telegram", "instagram", "vk", "site", "rss", "other"] as const;
export type ExternalChannelType = (typeof EXTERNAL_CHANNEL_TYPES)[number];

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeHost(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function normalizeTelegram(value: string): string {
  const v = normalizeText(value);
  if (!v) return v;
  const handle = v.replace(/^@/, "");
  if (/^https?:\/\//i.test(handle)) {
    try {
      const url = new URL(handle);
      const match = /^\/(?:(?:s|joinchat)\/)?([^/?#]+)/i.exec(url.pathname);
      if (match?.[1]) return `https://t.me/${match[1]}`;
      return `https://t.me/${url.pathname.replace(/^\/+/, "")}`;
    } catch {
      return handle;
    }
  }
  return `https://t.me/${handle}`;
}

function normalizeInstagram(value: string): string {
  const v = normalizeText(value);
  if (!v) return v;
  const handle = v.replace(/^@/, "").replace(/^\/+|\/+$/g, "");
  if (!/^https?:\/\//i.test(handle)) return `https://www.instagram.com/${handle}/`;
  try {
    const url = new URL(handle);
    const username = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return `https://www.instagram.com/${username.replace(/^@/, "")}/`;
  } catch {
    return handle;
  }
}

function normalizeVk(value: string): string {
  const v = normalizeText(value);
  if (!v) return v;
  const handle = v.replace(/^@/, "").replace(/^\/+|\/+$/g, "");
  if (!/^https?:\/\//i.test(handle)) return `https://vk.com/${handle}`;
  try {
    const url = new URL(handle);
    const host = normalizeHost(url.hostname);
    if (host.endsWith("vk.com")) {
      const path = url.pathname.replace(/^\/+|\/+$/g, "");
      return `https://vk.com/${path}`;
    }
    return handle;
  } catch {
    return handle;
  }
}

function normalizeSite(value: string): string {
  const v = normalizeText(value);
  if (!v) return v;
  if (!/^https?:\/\//i.test(v)) return `https://${v}`;
  try {
    const url = new URL(v);
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return v;
  }
}

export function normalizeSourceUrlOrHandle(type: string, value: string): string {
  switch (type) {
    case "telegram":
      return normalizeTelegram(value);
    case "instagram":
      return normalizeInstagram(value);
    case "vk":
      return normalizeVk(value);
    case "site":
    case "rss":
      return normalizeSite(value);
    default:
      return normalizeText(value);
  }
}

export function detectSourceType(urlOrHandle: string): ExternalChannelType {
  const v = normalizeText(urlOrHandle).toLowerCase();
  if (v.includes("t.me") || v.startsWith("@")) return "telegram";
  if (v.includes("instagram.com")) return "instagram";
  if (v.includes("vk.com")) return "vk";
  if (v.includes("rss") || v.endsWith(".xml") || v.endsWith(".rss") || v.includes("feed")) return "rss";
  if (v.includes("http://") || v.includes("https://")) return "site";
  return "other";
}

export type UpsertSourceInput = {
  type: string;
  name: string;
  urlOrHandle: string;
  organizerId?: string | null;
  parserProfile?: string | null;
  fetchIntervalMinutes?: number;
  isActive?: boolean;
  sourceOrigin?: string;
  lifecycleState?: string;
  autoPublish?: boolean;
  discipline?: string | null;
  country?: string | null;
  region?: string | null;
  metaJson?: Prisma.InputJsonValue;
  importSessionId?: string | null;
  /** FK на OrganizerExternalChannel; null = synthetic / без канала в БД */
  externalChannelId?: string | null;
};

export async function upsertSourceByTypeAndHandle(db: PrismaClient, input: UpsertSourceInput) {
  const normalizedHandle = normalizeSourceUrlOrHandle(input.type, input.urlOrHandle);
  const now = new Date().toISOString();
  const existing = await db.source.findFirst({
    where: {
      type: input.type,
      urlOrHandle: normalizedHandle,
    },
  });
  const metaObject: Record<string, unknown> = {
    ...(input.metaJson && typeof input.metaJson === "object" && !Array.isArray(input.metaJson)
      ? (input.metaJson as Record<string, unknown>)
      : {}),
    autoPublish: input.autoPublish ?? false,
    sourceOrigin: input.sourceOrigin ?? SOURCE_ORIGIN.MANUAL,
    lifecycleState: input.lifecycleState ?? SOURCE_LIFECYCLE.ACTIVE,
    importSessionId: input.importSessionId ?? null,
    externalChannelId: input.externalChannelId ?? null,
    updatedAt: now,
  };
  if (!existing) {
    return db.source.create({
      data: {
        type: input.type,
        name: input.name.trim(),
        urlOrHandle: normalizedHandle,
        organizerId: input.organizerId ?? null,
        parserProfile: input.parserProfile ?? null,
        fetchIntervalMinutes: Math.max(15, Math.floor(input.fetchIntervalMinutes ?? 1440)),
        isActive: input.isActive !== false,
        discipline: input.discipline ?? null,
        country: input.country ?? null,
        region: input.region ?? null,
        metaJson: metaObject as Prisma.InputJsonValue,
      },
    });
  }
  const existingMeta =
    existing.metaJson && typeof existing.metaJson === "object" && !Array.isArray(existing.metaJson)
      ? (existing.metaJson as Record<string, unknown>)
      : {};
  return db.source.update({
    where: { id: existing.id },
    data: {
      name: input.name.trim() || existing.name,
      organizerId: input.organizerId ?? existing.organizerId ?? null,
      parserProfile: input.parserProfile ?? existing.parserProfile ?? null,
      fetchIntervalMinutes:
        input.fetchIntervalMinutes !== undefined ? Math.max(15, Math.floor(input.fetchIntervalMinutes)) : existing.fetchIntervalMinutes,
      isActive: input.isActive ?? existing.isActive,
      discipline: input.discipline ?? existing.discipline,
      country: input.country ?? existing.country,
      region: input.region ?? existing.region,
      metaJson: {
        ...existingMeta,
        ...metaObject,
        sourceOrigin: input.sourceOrigin ?? existingMeta.sourceOrigin ?? SOURCE_ORIGIN.MANUAL,
        lifecycleState: input.lifecycleState ?? existingMeta.lifecycleState ?? SOURCE_LIFECYCLE.ACTIVE,
        importSessionId:
          input.importSessionId !== undefined ? input.importSessionId : (existingMeta.importSessionId ?? null),
        externalChannelId:
          input.externalChannelId !== undefined ? input.externalChannelId : existingMeta.externalChannelId ?? null,
      } as Prisma.InputJsonValue,
    },
  });
}

function metaLifecycle(metaJson: unknown): string {
  if (!metaJson || typeof metaJson !== "object" || Array.isArray(metaJson)) return "";
  const o = metaJson as Record<string, unknown>;
  return String(o.lifecycleState ?? "").trim();
}

function metaSourceOrigin(metaJson: unknown): string {
  if (!metaJson || typeof metaJson !== "object" || Array.isArray(metaJson)) return "";
  const o = metaJson as Record<string, unknown>;
  return String(o.sourceOrigin ?? "").trim();
}

export async function pauseContractAutoSources(db: PrismaClient, organizerId: string) {
  const rows = await db.source.findMany({
    where: { organizerId },
    select: { id: true, metaJson: true },
  });
  const toPause = rows.filter((r) => {
    if (metaSourceOrigin(r.metaJson) !== SOURCE_ORIGIN.CONTRACT_AUTO) return false;
    const life = metaLifecycle(r.metaJson);
    if (life === SOURCE_LIFECYCLE.MANUAL_OVERRIDE || life === SOURCE_LIFECYCLE.ARCHIVED) return false;
    return !isLifecycleProtectedFromContractPolicyPause(life);
  });
  let count = 0;
  for (const r of toPause) {
    const existingMeta =
      r.metaJson && typeof r.metaJson === "object" && !Array.isArray(r.metaJson)
        ? (r.metaJson as Record<string, unknown>)
        : {};
    await db.source.update({
      where: { id: r.id },
      data: {
        isActive: false,
        metaJson: {
          ...existingMeta,
          lifecycleState: SOURCE_LIFECYCLE.PAUSED_BY_POLICY,
        } as Prisma.InputJsonValue,
      },
    });
    count += 1;
  }
  return { count };
}
