import type { Env } from "@mywave/config";
import { callTelegramJson, resolveContentOwnerChatId } from "../telegram/telegramApi";
import type { OutreachMetrics } from "./metrics.js";

type Action = "approve" | "rewrite" | "skip" | "noSend";

/** O|action|cuid — укладываемся в лимит 64 B для callback_data. */
function encode(campaignId: string, a: Action): string {
  return `O|${a}|${campaignId}`;
}

export function parseOutreachCallback(
  data: string
): { action: "approve" | "rewrite" | "skip" | "noSend"; campaignId: string } | null {
  const m = data.match(
    /^O\|(approve|rewrite|skip|noSend)\|([a-z0-9]{8,32})$/i
  );
  if (!m) return null;
  return { action: m[1]!.toLowerCase() as "approve" | "rewrite" | "skip" | "noSend", campaignId: m[2]! };
}

export async function notifyOutreachOwner(
  env: Env,
  args: {
    id: string;
    displayName: string;
    periodStart: Date;
    periodEnd: Date;
    m: OutreachMetrics;
    templateType: string;
  }
): Promise<{ error?: string }> {
  const chat = resolveContentOwnerChatId(env);
  if (!chat || !env.TELEGRAM_BOT_API_BASE_URL) {
    return { error: "telegram not configured" };
  }

  const p0 = args.periodStart.toISOString().slice(0, 10);
  const p1 = args.periodEnd.toISOString().slice(0, 10);
  const text = `Outreach: организатор
${args.displayName}
Период: ${p0} — ${p1}

Статистика (из БД):
Просмотры: ${args.m.viewsCount}
Переходы: ${args.m.clicksCount}
Заявки: ${args.m.leadsCount}
Сделки: ${args.m.dealsCount}
Сумма сделок, ₽: ${args.m.dealAmountTotal}

Тип: ${args.templateType}

Следующий шаг — админ: /admin/organizer-outreach
Или кнопки:`;

  const id = args.id;
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Отправить", callback_data: encode(id, "approve") },
        { text: "✏️ Черновик", callback_data: encode(id, "rewrite") },
      ],
      [
        { text: "⏸ Пропустить", callback_data: encode(id, "skip") },
        { text: "❌ Не слать", callback_data: encode(id, "noSend") },
      ],
    ],
  };

  const res = await callTelegramJson(env, "sendMessage", {
    chat_id: chat,
    text: text.slice(0, 4000),
    reply_markup: keyboard,
  } as any);
  if (!res.ok) {
    return { error: res.description ?? "sendMessage failed" };
  }
  return {};
}

export { encode as encodeOutreachCallback };
