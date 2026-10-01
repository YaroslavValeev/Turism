/**
 * Публикация сэмплов Telegram Visual System v1 из exports/manifest.json.
 *
 *   pnpm --filter ./services/api exec tsx scripts/telegram-visual-publish.ts                 # владельцу в личку (по умолчанию)
 *   pnpm --filter ./services/api exec tsx scripts/telegram-visual-publish.ts --only CAMP,DROP
 *   pnpm --filter ./services/api exec tsx scripts/telegram-visual-publish.ts --target channel --yes   # боевой канал
 *   pnpm --filter ./services/api exec tsx scripts/telegram-visual-publish.ts --dry-run
 *
 * Токен берётся из .env (TELEGRAM_BOT_TOKEN) и никогда не печатается.
 */
import "../src/env/loadProcessEnv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildTelegramBotApiUrl } from "@mywave/config";
import { proxyAwareFetch } from "../src/lib/proxyFetch";
import { buildMultipart } from "../src/modules/telegram/telegramPhoto";

type ManifestEntry = {
  rubric: string;
  programId: string;
  file: string;
  captionHtml: string;
  replyMarkup: unknown;
};

const EXPORTS = path.resolve(__dirname, "../../../docs/design/telegram-visual-system-v1/exports");
const PAUSE_MS = 3500;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function callBot(method: string, init?: RequestInit): Promise<{ status: number; json: any }> {
  const url = buildTelegramBotApiUrl(process.env, method);
  if (!url) throw new Error("TELEGRAM_BOT_TOKEN не задан в .env");
  const res = await proxyAwareFetch(url, init, process.env.TELEGRAM_BOT_HTTP_PROXY);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, description: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function main() {
  const target = arg("target") ?? "owner";
  const chatId =
    target === "channel"
      ? process.env.TELEGRAM_UPDATES_CHANNEL_CHAT_ID
      : (process.env.TELEGRAM_CONTENT_OWNER_CHAT_ID ?? process.env.OWNER_CHAT_ID);
  if (!chatId) {
    throw new Error(`chat_id для target=${target} не задан (TELEGRAM_UPDATES_CHANNEL_CHAT_ID / TELEGRAM_CONTENT_OWNER_CHAT_ID / OWNER_CHAT_ID)`);
  }
  if (target === "channel" && !flag("yes")) {
    throw new Error("Публикация в боевой канал требует явного флага --yes");
  }

  const manifestPath = path.join(EXPORTS, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("Нет manifest.json — сначала запустите scripts/telegram-visual-samples.ts");
  const only = arg("only")?.split(",").map((s) => s.trim().toUpperCase());
  const entries = (JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[]).filter(
    (e) => !only || only.includes(e.rubric),
  );
  console.log(`target=${target} chat=${chatId} posts=${entries.length}${flag("dry-run") ? " (dry-run)" : ""}`);

  if (flag("dry-run")) {
    for (const e of entries) console.log(`  ${e.rubric.padEnd(12)} ${e.file}`);
    return;
  }

  const me = await callBot("getMe");
  if (!me.json?.ok) {
    console.error(`getMe: HTTP ${me.status} ${me.json?.description ?? ""}`);
    if (me.status === 401) {
      console.error("Токен бота недействителен: перевыпустите его в @BotFather (/revoke → /token) и обновите TELEGRAM_BOT_TOKEN в .env.");
    }
    process.exitCode = 2;
    return;
  }
  console.log(`bot=@${me.json.result.username}`);

  const log: unknown[] = [];
  for (const [i, e] of entries.entries()) {
    const multipart = buildMultipart(
      {
        chat_id: chatId,
        caption: e.captionHtml,
        parse_mode: "HTML",
        reply_markup: JSON.stringify(e.replyMarkup),
      },
      { field: "photo", filename: path.basename(e.file), contentType: "image/png", data: readFileSync(path.join(EXPORTS, e.file)) },
    );
    const res = await callBot("sendPhoto", {
      method: "POST",
      headers: { "content-type": multipart.contentType, "content-length": String(multipart.body.length) },
      body: new Uint8Array(multipart.body),
    });
    const ok = Boolean(res.json?.ok);
    const messageId = res.json?.result?.message_id ?? null;
    console.log(`  ${e.rubric.padEnd(12)} ${ok ? `ok message_id=${messageId}` : `FAIL ${res.status} ${res.json?.description ?? ""}`}`);
    log.push({ rubric: e.rubric, programId: e.programId, file: e.file, ok, messageId, at: new Date().toISOString() });
    if (i < entries.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  writeFileSync(path.join(EXPORTS, `publish-log.${target}.json`), `${JSON.stringify(log, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
