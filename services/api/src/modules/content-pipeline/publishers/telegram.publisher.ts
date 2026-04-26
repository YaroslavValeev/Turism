import type { Env } from "@mywave/config";
import type { ChannelPublisher, PublishAdapterInput, PublishAdapterResult } from "./types";
import { callTelegramJson } from "../../telegram/telegramApi";

export function createTelegramPublisher(env: Env): ChannelPublisher {
  return {
    channel: "telegram_channel",
    async publish(input: PublishAdapterInput): Promise<PublishAdapterResult> {
      const chatId = env.TELEGRAM_UPDATES_CHANNEL_CHAT_ID?.trim();
      if (!chatId) throw new Error("TELEGRAM_UPDATES_CHANNEL_CHAT_ID not set");
      if (!env.TELEGRAM_BOT_API_BASE_URL) throw new Error("TELEGRAM_BOT_API_BASE_URL not set");
      const text = `${input.text}\n\n#mywave`;
      const res = await callTelegramJson<{ message_id: number }>(env, "sendMessage", {
        chat_id: chatId,
        text: text.slice(0, 4090),
        disable_web_page_preview: false,
      });
      if (!res.ok || !res.result) {
        throw new Error(res.description || "telegram publish failed");
      }
      return {
        externalId: String(res.result.message_id),
        url: chatId.startsWith("@") ? `https://t.me/${chatId.slice(1)}/${res.result.message_id}` : null,
        raw: res,
      };
    },
  };
}

