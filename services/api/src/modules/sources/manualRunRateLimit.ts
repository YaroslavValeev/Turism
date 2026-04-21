/**
 * In-memory rate limit для ручных ingestion run (admin).
 * Процесс один — Map не шарится между инстансами (при горизонтальном масштабе см. Redis / отдельный сервис).
 */

const lastAt = new Map<string, number>();

function pruneStale(maxEntries = 2500, maxAgeMs = 3_600_000) {
  if (lastAt.size < maxEntries) return;
  const now = Date.now();
  for (const [k, t] of lastAt) {
    if (now - t > maxAgeMs) lastAt.delete(k);
  }
  if (lastAt.size > maxEntries) lastAt.clear();
}

export function tryAcquireManualRunSlot(
  key: string,
  minIntervalMs: number,
): { ok: true } | { ok: false; retryAfterMs: number } {
  if (!Number.isFinite(minIntervalMs) || minIntervalMs <= 0) {
    return { ok: true };
  }
  pruneStale();
  const now = Date.now();
  const prev = lastAt.get(key) ?? 0;
  if (now - prev < minIntervalMs) {
    return { ok: false, retryAfterMs: Math.ceil(minIntervalMs - (now - prev)) };
  }
  lastAt.set(key, now);
  return { ok: true };
}
