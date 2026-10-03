import { createHash, randomBytes } from "node:crypto";

export const SUBSCRIPTION_POLICY_VERSION = "updates-v2-2026-10-03";
const LEVELS = new Set(["beginner", "intermediate", "advanced", "expert", "all_levels"]);

function day(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Некорректная дата подписки.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Некорректная дата подписки.");
  return parsed;
}

export function subscriptionFilters(body: { levelRequired?: unknown; dateFrom?: unknown; dateTo?: unknown }) {
  const levelRequired = body.levelRequired === undefined || body.levelRequired === "" ? null : body.levelRequired;
  if (levelRequired !== null && (typeof levelRequired !== "string" || !LEVELS.has(levelRequired))) throw new Error("Некорректный уровень подписки.");
  const dateFrom = day(body.dateFrom);
  const dateTo = day(body.dateTo);
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("Дата окончания раньше начала.");
  return { levelRequired: levelRequired as string | null, dateFrom, dateTo };
}

export function hashSubscriptionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSubscriptionToken(now = new Date()) {
  const token = randomBytes(24).toString("hex");
  return { token, hash: hashSubscriptionToken(token), expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
}

export function subscriptionIdentity(values: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export function subscriptionMatches(sub: { discipline?: string | null; region?: string | null; levelRequired: string | null; dateFrom: Date | null; dateTo: Date | null },
  program: { discipline?: string; region?: string; levelRequired: string | null; startDate: Date; scheduleType: string }) {
  if (sub.discipline && !sub.discipline.split(",").some(d => program.discipline?.toLowerCase().includes(d.trim().toLowerCase()))) return false;
  if (sub.region && !program.region?.toLowerCase().includes(sub.region.toLowerCase())) return false;
  if (sub.levelRequired && sub.levelRequired !== program.levelRequired) return false;
  if ((sub.dateFrom || sub.dateTo) && program.scheduleType === "on_request") return false;
  const start = program.startDate.toISOString().slice(0, 10);
  return (!sub.dateFrom || start >= sub.dateFrom.toISOString().slice(0, 10)) &&
    (!sub.dateTo || start <= sub.dateTo.toISOString().slice(0, 10));
}
