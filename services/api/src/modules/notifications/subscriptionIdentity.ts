import crypto from "node:crypto";

/** Стабильная строка filters для хэша (ключи отсортированы). */
export function stableFiltersJson(filters: unknown): string {
  if (filters == null || typeof filters !== "object" || Array.isArray(filters)) {
    return "{}";
  }
  const f = filters as Record<string, unknown>;
  const sorted = Object.keys(f)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = f[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

export function buildSubscriptionIdentityKey(input: {
  channel: string;
  contactEmail?: string | null;
  telegramChatId?: string | null;
  maxRecipientId?: string | null;
  type: string;
  filters: unknown;
}): string {
  const fp = crypto.createHash("sha256").update(stableFiltersJson(input.filters)).digest("hex").slice(0, 32);
  if (input.channel === "email") {
    const e = (input.contactEmail ?? "").trim().toLowerCase();
    return `e:${e}:${input.type}:${fp}`;
  }
  if (input.channel === "telegram") {
    const tg = (input.telegramChatId ?? "").trim();
    return `tg:${tg}:${input.type}:${fp}`;
  }
  if (input.channel === "max") {
    const mx = (input.maxRecipientId ?? "").trim();
    return `max:${mx}:${input.type}:${fp}`;
  }
  return `x:${String(input.channel).trim()}:${input.type}:${fp}`;
}
