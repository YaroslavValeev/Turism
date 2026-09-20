import { randomUUID } from "node:crypto";
import { buildTelegramBotApiUrl, type Env } from "@mywave/config";
import { proxyFetch } from "../../lib/proxyFetch";
import { safeError, safeLog } from "../../lib/safeLogger";
import { dispatchTelegramWebhookUpdate } from "./webhookRoutes";
import type { TelegramUpdate } from "../telegram-platform/webhookHandler";
import {
  acquireTelegramPollingLease,
  completeTelegramPollingUpdate,
  pendingTelegramPollingUpdates,
  pruneTelegramPollingUpdates,
  releaseTelegramPollingLease,
  renewTelegramPollingLease,
  storeTelegramPollingUpdates,
  telegramPollingOffset,
} from "./telegramPollingStore";

const POLL_SECONDS = 20;
const LEASE_RENEW_MS = 15_000;
const RETRY_MS = 5_000;
const WEBHOOK_RECHECK_MS = 10_000;

type TelegramApiResponse<T> = { ok: boolean; result?: T };
type WebhookInfo = { url?: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function telegramRequest<T>(env: Env, method: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const url = buildTelegramBotApiUrl(env, method);
  if (!url) throw new Error("Telegram Bot API is not configured");
  const response = await proxyFetch(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    },
    env.TELEGRAM_BOT_HTTP_PROXY,
  );
  if (!response.ok) throw new Error(`Telegram ${method} HTTP ${response.status}`);
  const parsed = (await response.json()) as TelegramApiResponse<T>;
  if (!parsed.ok || parsed.result === undefined) throw new Error(`Telegram ${method} returned an error`);
  return parsed.result;
}

export function validTelegramPollingUpdates(value: unknown): TelegramUpdate[] {
  if (!Array.isArray(value)) throw new Error("Telegram getUpdates returned a non-array result");
  return value.map((update) => {
    if (
      !update ||
      typeof update !== "object" ||
      !Number.isSafeInteger(update.update_id) ||
      update.update_id < 0
    ) {
      throw new Error("Telegram getUpdates returned an invalid update_id");
    }
    return update as TelegramUpdate;
  });
}

async function processInbox(env: Env, leaseIsCurrent: () => boolean): Promise<void> {
  while (leaseIsCurrent()) {
    const updates = await pendingTelegramPollingUpdates();
    if (updates.length === 0) return;
    for (const update of updates) {
      if (!leaseIsCurrent()) return;
      const result = await dispatchTelegramWebhookUpdate(env, update);
      await completeTelegramPollingUpdate(update.update_id, result);
      if (!result.contentOk || !result.platformOk) {
        safeLog("[telegram-polling] update handler reported failure", {
          updateId: update.update_id,
          contentOk: result.contentOk,
          platformOk: result.platformOk,
        });
      }
    }
  }
}

/** Disabled by default. The worker never calls getUpdates while a webhook URL remains registered. */
export function startTelegramLongPolling(env: Env): void {
  if (!env.TELEGRAM_LONG_POLLING_ENABLED) return;
  if (!buildTelegramBotApiUrl(env, "getUpdates")) {
    safeError("[telegram-polling] enabled without a configured Bot API");
    return;
  }

  const owner = randomUUID();
  void (async () => {
    while (true) {
      let acquired = false;
      let leaseCurrent = true;
      let renewing = false;
      let renewTimer: ReturnType<typeof setInterval> | undefined;
      try {
        acquired = await acquireTelegramPollingLease(owner);
        if (!acquired) {
          await delay(RETRY_MS);
          continue;
        }
        await pruneTelegramPollingUpdates();
        renewTimer = setInterval(() => {
          if (renewing || !leaseCurrent) return;
          renewing = true;
          void renewTelegramPollingLease(owner)
            .then((renewed) => {
              if (!renewed) leaseCurrent = false;
            })
            .catch(() => {
              leaseCurrent = false;
              safeError("[telegram-polling] lease renewal failed");
            })
            .finally(() => {
              renewing = false;
            });
        }, LEASE_RENEW_MS);

        let webhookWarningSent = false;
        let lastPruneAt = Date.now();
        while (leaseCurrent) {
          if (Date.now() - lastPruneAt > 60 * 60 * 1_000) {
            await pruneTelegramPollingUpdates();
            lastPruneAt = Date.now();
          }
          const info = await telegramRequest<WebhookInfo>(env, "getWebhookInfo", {}, 12_000);
          if (info.url) {
            if (!webhookWarningSent) {
              safeLog("[telegram-polling] waiting for webhook removal; pending updates are preserved");
              webhookWarningSent = true;
            }
            await delay(WEBHOOK_RECHECK_MS);
            continue;
          }
          webhookWarningSent = false;
          await processInbox(env, () => leaseCurrent);
          if (!leaseCurrent) break;

          const offset = await telegramPollingOffset();
          const result = await telegramRequest<unknown>(
            env,
            "getUpdates",
            { offset, limit: 100, timeout: POLL_SECONDS, allowed_updates: ["message", "callback_query"] },
            (POLL_SECONDS + 12) * 1_000,
          );
          if (!leaseCurrent) break;
          const updates = validTelegramPollingUpdates(result);
          if (updates.length > 0) {
            await storeTelegramPollingUpdates(owner, updates);
            await processInbox(env, () => leaseCurrent);
            safeLog("[telegram-polling] batch stored", { count: updates.length });
          }
        }
      } catch (error) {
        // Never log Telegram request URLs: they contain the bot token.
        safeError("[telegram-polling] cycle failed", error instanceof Error ? error.name : undefined);
      } finally {
        leaseCurrent = false;
        if (renewTimer) clearInterval(renewTimer);
        if (acquired) {
          await releaseTelegramPollingLease(owner).catch(() => {
            safeError("[telegram-polling] lease release failed");
          });
        }
      }
      await delay(RETRY_MS);
    }
  })();
}
