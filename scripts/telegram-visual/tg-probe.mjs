// Диагностика доступа бота к каналу. Токен не выводится.
import { readFileSync } from "node:fs";

function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv("services/api/.env");
const origin = (env.TELEGRAM_API_BASE_URL || "https://api.telegram.org").replace(/\/+$/, "");
const token = env.TELEGRAM_BOT_TOKEN;
const chat = env.TELEGRAM_UPDATES_CHANNEL_CHAT_ID;

async function call(method, body = {}) {
  try {
    const r = await fetch(`${origin}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    if (!j.ok) console.log(`  ${method} error:`, j.error_code, j.description);
    return j;
  } catch (e) {
    console.log(`  ${method} network error:`, e.cause?.code ?? e.message);
    return { ok: false };
  }
}

const me = await call("getMe");
console.log("getMe:", me.ok, me.result?.username, me.result?.id);
const chatInfo = await call("getChat", { chat_id: chat });
console.log("getChat:", chatInfo.ok, chatInfo.result?.title, chatInfo.result?.type, "desc:", JSON.stringify(chatInfo.result?.description ?? null));
console.log("has photo:", Boolean(chatInfo.result?.photo), "linked:", chatInfo.result?.linked_chat_id ?? null, "username:", chatInfo.result?.username ?? null);
if (me.ok) {
  const member = await call("getChatMember", { chat_id: chat, user_id: me.result.id });
  const r = member.result ?? {};
  console.log("bot status:", r.status, {
    can_post_messages: r.can_post_messages,
    can_edit_messages: r.can_edit_messages,
    can_change_info: r.can_change_info,
    can_post_stories: r.can_post_stories,
    can_invite_users: r.can_invite_users,
  });
}
const count = await call("getChatMemberCount", { chat_id: chat });
console.log("members:", count.result);
