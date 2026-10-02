/**
 * Пост «Быстрый поиск по датам»: превью с логотипом сверху (ведёт на сайт) и кнопки дат.
 *
 *   pnpm --filter ./services/api exec tsx scripts/telegram-date-search-post.ts                       # владельцу в личку (превью)
 *   pnpm --filter ./services/api exec tsx scripts/telegram-date-search-post.ts --dry-run
 *   pnpm --filter ./services/api exec tsx scripts/telegram-date-search-post.ts --target channel --yes --pin
 *   pnpm --filter ./services/api exec tsx scripts/telegram-date-search-post.ts --target channel --yes --edit 135   # обновить уже опубликованный (закреп сохраняется)
 *   pnpm --filter ./services/api exec tsx scripts/telegram-date-search-post.ts --menu-button         # «Меню» в личке бота → календарь
 *
 * Календарь как Mini App внутри Telegram: TELEGRAM_DATES_MINIAPP_URL=https://t.me/<bot>/<app> (или --mini-app);
 * без него кнопка «Выбрать свои даты» открывает страницу /dates во встроенном браузере.
 * Адрес сайта: --site, иначе https://mywavetour.ru (локальный PUBLIC_WEB_BASE_URL обычно localhost,
 * а Telegram не принимает такие ссылки в кнопках). Токен берётся из .env и не печатается.
 */
import "../src/env/loadProcessEnv";
import { buildTelegramBotApiUrl } from "@mywave/config";
import { proxyAwareFetch } from "../src/lib/proxyFetch";
import { buildDateSearchMessage, isTelegramMiniAppLink } from "../src/modules/telegram/dateSearchPost";

const DEFAULT_SITE = "https://mywavetour.ru";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function callBot(method: string, body: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const url = buildTelegramBotApiUrl(process.env, method);
  if (!url) throw new Error("TELEGRAM_BOT_TOKEN не задан в .env");
  const res = await proxyAwareFetch(
    url,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    process.env.TELEGRAM_BOT_HTTP_PROXY,
  );
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: { ok: false, description: text.slice(0, 200) } };
  }
}

async function setMenuButton(site: string) {
  const result = await callBot("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Даты", web_app: { url: `${site}/dates?utm_source=telegram_bot&utm_medium=menu` } },
  });
  console.log(result.json?.ok ? "menu button: web_app → /dates" : `menu button failed: ${result.json?.description ?? result.status}`);
}

async function main() {
  const site = (arg("site") ?? DEFAULT_SITE).replace(/\/+$/, "");
  if (!/^https:\/\//.test(site)) throw new Error(`--site должен быть https: ${site}`);

  if (flag("menu-button")) {
    await setMenuButton(site);
    return;
  }

  const target = arg("target") ?? "owner";
  const chatId =
    target === "channel"
      ? process.env.TELEGRAM_UPDATES_CHANNEL_CHAT_ID
      : (process.env.TELEGRAM_CONTENT_OWNER_CHAT_ID ?? process.env.OWNER_CHAT_ID);
  if (!chatId) throw new Error(`chat_id для target=${target} не задан`);
  if (target === "channel" && !flag("yes")) throw new Error("Публикация в боевой канал требует флага --yes");

  const miniAppUrl = arg("mini-app") ?? process.env.TELEGRAM_DATES_MINIAPP_URL;
  if (miniAppUrl && !isTelegramMiniAppLink(miniAppUrl)) {
    throw new Error(`Mini App должен быть вида https://t.me/<bot>/<app>: ${miniAppUrl}`);
  }

  const message = buildDateSearchMessage(site, { miniAppUrl });
  console.log(`target=${target} chat=${chatId} site=${site} miniApp=${miniAppUrl ?? "нет"}${flag("dry-run") ? " (dry-run)" : ""}`);
  console.log(`  preview: ${message.link_preview_options.url}`);
  if (arg("edit") && !/^\d+$/.test(arg("edit")!)) throw new Error("--edit ожидает message_id");
  for (const b of message.reply_markup.inline_keyboard.flat()) console.log(`  [${b.text}] ${b.url}`);
  if (flag("dry-run")) return;

  const editId = arg("edit");
  if (editId) {
    const edited = await callBot("editMessageText", { chat_id: chatId, message_id: Number(editId), ...message });
    const ok = edited.json?.ok || /message is not modified/i.test(edited.json?.description ?? "");
    console.log(ok ? `edited message_id=${editId}` : `editMessageText: HTTP ${edited.status} ${edited.json?.description ?? ""}`);
    if (!ok) process.exitCode = 2;
    return;
  }

  const sent = await callBot("sendMessage", { chat_id: chatId, ...message });
  if (!sent.json?.ok) {
    console.error(`sendMessage: HTTP ${sent.status} ${sent.json?.description ?? ""}`);
    process.exitCode = 2;
    return;
  }
  const messageId = sent.json.result.message_id as number;
  console.log(`sent message_id=${messageId}`);

  if (flag("pin")) {
    const pinned = await callBot("pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true });
    console.log(pinned.json?.ok ? "pinned" : `pin failed: ${pinned.json?.description ?? pinned.status}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
