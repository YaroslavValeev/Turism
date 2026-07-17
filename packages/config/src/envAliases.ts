/**
 * Приводит process.env к каноническим именам API runtime до вызова loadEnv().
 * Дублируемые «удобные» имена (root .env / legacy) → INTERNAL_ANALYTICS_TOKEN, TELEGRAM_*.
 */
function trim(v: string | undefined): string {
  if (v === undefined || v === "") return "";
  const s = v.trim();
  return s;
}

export function applyApiRuntimeEnvAliases(): void {
  if (!trim(process.env.INTERNAL_ANALYTICS_TOKEN) && trim(process.env.TARGET_INTERNAL_TOKEN)) {
    process.env.INTERNAL_ANALYTICS_TOKEN = trim(process.env.TARGET_INTERNAL_TOKEN);
  }

  if (!trim(process.env.TELEGRAM_BOT_API_BASE_URL) && trim(process.env.TELEGRAM_BOT_TOKEN)) {
    const token = trim(process.env.TELEGRAM_BOT_TOKEN);
    process.env.TELEGRAM_BOT_API_BASE_URL = `https://api.telegram.org/bot${token}`;
  }

  if (!trim(process.env.TELEGRAM_ALERT_CHAT_ID) && trim(process.env.OWNER_CHAT_ID)) {
    process.env.TELEGRAM_ALERT_CHAT_ID = trim(process.env.OWNER_CHAT_ID);
  }

  if (!trim(process.env.TELEGRAM_WEBHOOK_SECRET) && trim(process.env.TELEGRAM_PLATFORM_WEBHOOK_SECRET)) {
    process.env.TELEGRAM_WEBHOOK_SECRET = trim(process.env.TELEGRAM_PLATFORM_WEBHOOK_SECRET);
  }

  if (!trim(process.env.TELEGRAM_BOT_USERNAME) && trim(process.env.TELEGRAM_UPDATES_BOT_USERNAME)) {
    process.env.TELEGRAM_BOT_USERNAME = trim(process.env.TELEGRAM_UPDATES_BOT_USERNAME);
  }
}
