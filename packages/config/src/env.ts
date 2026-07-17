/**
 * Env parsing. Source of truth: config_and_secrets_map.csv
 * Алиасы legacy → канон (TARGET_INTERNAL_TOKEN, TELEGRAM_BOT_TOKEN, OWNER_CHAT_ID): см. applyApiRuntimeEnvAliases.
 */

function required(key: string): string {
  const v = process.env[key];
  if (v === undefined || v === "") {
    throw new Error(`Missing required env: ${key}`);
  }
  return v;
}

function optional(key: string): string | undefined {
  return process.env[key];
}

function optionalBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function optionalNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export interface Env {
  APP_ENV: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  ADMIN_JWT_SECRET: string;
  EMAIL_PROVIDER_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  SMTP_SECURE: boolean;
  /**
   * Staging/QA: если задан (через запятую), email-рассылка «новая программа» идёт только на эти адреса.
   * Снижает риск mass-mail при e2e на общей БД. В prod обычно пусто.
   */
  EMAIL_STAGING_ALLOWLIST?: string;
  SENTRY_DSN?: string;
  INGESTION_DAILY_ENABLED: boolean;
  INGESTION_DAILY_HOUR_LOCAL: number;
  INGESTION_AUTOPUBLISH_ENABLED: boolean;
  INGESTION_DEFAULT_FALLBACK_IMAGE_URL?: string;
  /** Включает запись server-side analytics + ingestion. В prod рекомендуется включать явно. */
  ANALYTICS_ENABLED: boolean;
  /** Секрет для `POST /internal/analytics/*` (не путать с admin JWT). */
  INTERNAL_ANALYTICS_TOKEN?: string;
  /** Bearer token для private Camp API: GET /api/v1/camps, /api/v1/camps/:id, /camps-feed.json. */
  CAMP_API_TOKEN?: string;
  /** Опционально: Telegram Bot API для алертов (`https://api.telegram.org/bot<token>/sendMessage`). */
  TELEGRAM_BOT_API_BASE_URL?: string;
  /** chat_id получателя алертов */
  TELEGRAM_ALERT_CHAT_ID?: string;
  /** chat_id канала витрины/операционки (может совпадать с ALERT) */
  TELEGRAM_CHANNEL_CHAT_ID?: string;
  /** chat_id owner для согласования контент-конвейера; иначе используется TELEGRAM_ALERT_CHAT_ID. */
  TELEGRAM_CONTENT_OWNER_CHAT_ID?: string;
  /** Секрет в path: `POST /public/telegram/content-pipeline/:token` */
  CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN?: string;
  /** Секрет для единого webhook ingress (`X-Telegram-Bot-Api-Secret-Token`). */
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** Username бота (без @), если нужен для deep-link генерации/логов. */
  TELEGRAM_BOT_USERNAME?: string;
  /** Опционально: OpenAI для расшифровки voice (rewrite). */
  OPENAI_API_KEY?: string;
  /** SOCKS5/HTTP proxy URL for OpenAI egress from restricted RU VPS. */
  OPENAI_HTTP_PROXY?: string;
  /** Optional proxy URL for Telegram Bot API only when direct Bot API is unstable. */
  TELEGRAM_BOT_HTTP_PROXY?: string;
  /** Публичная ссылка-приглашение в TG группу/канал с обновлениями */
  TELEGRAM_UPDATES_INVITE_LINK?: string;
  /** Username бота для deep-link opt-in (без @), опционально */
  TELEGRAM_UPDATES_BOT_USERNAME?: string;
  /** Канал/группа для автопубликации новых программ (пример: @mywave_updates или -1001234567890). */
  TELEGRAM_UPDATES_CHANNEL_CHAT_ID?: string;
  /** Базовый URL web-приложения для ссылок в письмах/Telegram. */
  PUBLIC_WEB_BASE_URL: string;
  /** Базовый URL API для unsubscribe ссылок в письмах. */
  PUBLIC_API_BASE_URL: string;
  /** Минимальный интервал между одинаковыми алертами (секунды) */
  ANALYTICS_ALERT_COOLDOWN_SECONDS: number;
  /** Соль для HMAC traveler key (Lead/Booking). Только сервер; без соли хеш не пишется. */
  TRAVELER_KEY_SALT?: string;
  /** Периодический mart + scores + alerts в процессе API (см. docs/analytics/runtime/SCHEDULE.md). */
  ANALYTICS_OPS_SCHEDULER_ENABLED: boolean;
  /** Интервал ops-scheduler, мс (по умолчанию 1 час). */
  ANALYTICS_OPS_INTERVAL_MS: number;
  /** Минимум бронирований для band organizer score (не unknown). */
  SCORE_MIN_BOOKINGS_FOR_BAND: number;
  /** Минимум просмотров для performance-части program score. */
  SCORE_MIN_VIEWS_FOR_PROGRAM_PERF: number;
  /** DQ: ожидаемый минимум frontend-событий за окно (ниже — warning при ненулевом трафике). */
  ANALYTICS_DQ_EVENT_BASELINE: number;
  ANALYTICS_DQ_INGESTION_ERRORS_WARNING: number;
  ANALYTICS_DQ_INGESTION_ERRORS_CRITICAL: number;
  ANALYTICS_DQ_DUPLICATE_WARNING: number;
  /** DQ: lag между eventTime и ingestedAt для late_event_count. */
  ANALYTICS_DQ_LATE_EVENT_LAG_SEC: number;
  /** DQ: критический/ warning lag последнего ingestedAt относительно now. */
  ANALYTICS_DQ_MAX_PIPELINE_LAG_SEC: number;
  /**
   * PR2: разрешить `POST /sources/linkage-backfill` с `mode: apply` (запись externalChannelId из meta).
   * По умолчанию выключено — сначала только dry-run.
   */
  SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED: boolean;
  CORS_ALLOWED_ORIGINS?: string;
  PUBLIC_RATE_LIMIT_WINDOW_MS: number;
  PUBLIC_RATE_LIMIT_MAX: number;
  /** Пилот: бесплатный период для орг., без выставления счетов; UI/API показывают shadow-метрики. */
  PILOT_MODE_ENABLED: boolean;
  /** Пилот: admin-only AI-эндпоинты (нормализатор, аудит, safety, founder summary). */
  AI_ENABLED: boolean;
  /**
   * Канон: публикация/рассылка/смена статуса только после подтверждения владельца.
   * Используется политикой и UI; по умолчанию true.
   */
  AI_OWNER_APPROVAL_REQUIRED: boolean;
  /** Запрещён автопаблиш AI; по умолчанию false. */
  AI_AUTOPUBLISH_ENABLED: boolean;
}

export function loadEnv(): Env {
  return {
    APP_ENV: required("APP_ENV"),
    DATABASE_URL: required("DATABASE_URL"),
    JWT_SECRET: required("JWT_SECRET"),
    ADMIN_JWT_SECRET: required("ADMIN_JWT_SECRET"),
    EMAIL_PROVIDER_KEY: optional("EMAIL_PROVIDER_KEY"),
    SMTP_HOST: optional("SMTP_HOST"),
    SMTP_PORT: optionalNumber("SMTP_PORT", 587),
    SMTP_USER: optional("SMTP_USER"),
    SMTP_PASS: optional("SMTP_PASS"),
    SMTP_FROM: optional("SMTP_FROM"),
    SMTP_SECURE: optionalBoolean("SMTP_SECURE", false),
    EMAIL_STAGING_ALLOWLIST: optional("EMAIL_STAGING_ALLOWLIST"),
    SENTRY_DSN: optional("SENTRY_DSN"),
    INGESTION_DAILY_ENABLED: optionalBoolean("INGESTION_DAILY_ENABLED", false),
    INGESTION_DAILY_HOUR_LOCAL: optionalNumber("INGESTION_DAILY_HOUR_LOCAL", 8),
    INGESTION_AUTOPUBLISH_ENABLED: optionalBoolean("INGESTION_AUTOPUBLISH_ENABLED", true),
    INGESTION_DEFAULT_FALLBACK_IMAGE_URL: optional("INGESTION_DEFAULT_FALLBACK_IMAGE_URL"),
    ANALYTICS_ENABLED: optionalBoolean("ANALYTICS_ENABLED", false),
    INTERNAL_ANALYTICS_TOKEN: optional("INTERNAL_ANALYTICS_TOKEN"),
    CAMP_API_TOKEN: optional("CAMP_API_TOKEN"),
    TELEGRAM_BOT_API_BASE_URL: optional("TELEGRAM_BOT_API_BASE_URL"),
    TELEGRAM_ALERT_CHAT_ID: optional("TELEGRAM_ALERT_CHAT_ID"),
    TELEGRAM_CHANNEL_CHAT_ID: optional("TELEGRAM_CHANNEL_CHAT_ID"),
    TELEGRAM_CONTENT_OWNER_CHAT_ID: optional("TELEGRAM_CONTENT_OWNER_CHAT_ID"),
    CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN: optional("CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN"),
    TELEGRAM_WEBHOOK_SECRET: optional("TELEGRAM_WEBHOOK_SECRET"),
    TELEGRAM_BOT_USERNAME: optional("TELEGRAM_BOT_USERNAME"),
    OPENAI_API_KEY: optional("OPENAI_API_KEY"),
    OPENAI_HTTP_PROXY: optional("OPENAI_HTTP_PROXY"),
    TELEGRAM_BOT_HTTP_PROXY: optional("TELEGRAM_BOT_HTTP_PROXY"),
    TELEGRAM_UPDATES_INVITE_LINK: optional("TELEGRAM_UPDATES_INVITE_LINK"),
    TELEGRAM_UPDATES_BOT_USERNAME: optional("TELEGRAM_UPDATES_BOT_USERNAME"),
    TELEGRAM_UPDATES_CHANNEL_CHAT_ID: optional("TELEGRAM_UPDATES_CHANNEL_CHAT_ID"),
    PUBLIC_WEB_BASE_URL: optional("PUBLIC_WEB_BASE_URL") ?? "http://localhost:3000",
    PUBLIC_API_BASE_URL: optional("PUBLIC_API_BASE_URL") ?? "http://localhost:3001",
    ANALYTICS_ALERT_COOLDOWN_SECONDS: optionalNumber("ANALYTICS_ALERT_COOLDOWN_SECONDS", 3600),
    TRAVELER_KEY_SALT: optional("TRAVELER_KEY_SALT"),
    ANALYTICS_OPS_SCHEDULER_ENABLED: optionalBoolean("ANALYTICS_OPS_SCHEDULER_ENABLED", false),
    ANALYTICS_OPS_INTERVAL_MS: optionalNumber("ANALYTICS_OPS_INTERVAL_MS", 3_600_000),
    SCORE_MIN_BOOKINGS_FOR_BAND: optionalNumber("SCORE_MIN_BOOKINGS_FOR_BAND", 2),
    SCORE_MIN_VIEWS_FOR_PROGRAM_PERF: optionalNumber("SCORE_MIN_VIEWS_FOR_PROGRAM_PERF", 8),
    ANALYTICS_DQ_EVENT_BASELINE: optionalNumber("ANALYTICS_DQ_EVENT_BASELINE", 5),
    ANALYTICS_DQ_INGESTION_ERRORS_WARNING: optionalNumber("ANALYTICS_DQ_INGESTION_ERRORS_WARNING", 10),
    ANALYTICS_DQ_INGESTION_ERRORS_CRITICAL: optionalNumber("ANALYTICS_DQ_INGESTION_ERRORS_CRITICAL", 50),
    ANALYTICS_DQ_DUPLICATE_WARNING: optionalNumber("ANALYTICS_DQ_DUPLICATE_WARNING", 20),
    ANALYTICS_DQ_LATE_EVENT_LAG_SEC: optionalNumber("ANALYTICS_DQ_LATE_EVENT_LAG_SEC", 7200),
    ANALYTICS_DQ_MAX_PIPELINE_LAG_SEC: optionalNumber("ANALYTICS_DQ_MAX_PIPELINE_LAG_SEC", 21600),
    SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED: optionalBoolean("SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED", false),
    CORS_ALLOWED_ORIGINS: optional("CORS_ALLOWED_ORIGINS"),
    PUBLIC_RATE_LIMIT_WINDOW_MS: optionalNumber("PUBLIC_RATE_LIMIT_WINDOW_MS", 60_000),
    PUBLIC_RATE_LIMIT_MAX: optionalNumber("PUBLIC_RATE_LIMIT_MAX", 80),
    PILOT_MODE_ENABLED: optionalBoolean("PILOT_MODE_ENABLED", false),
    AI_ENABLED: optionalBoolean("AI_ENABLED", false),
    AI_OWNER_APPROVAL_REQUIRED: optionalBoolean("AI_OWNER_APPROVAL_REQUIRED", true),
    AI_AUTOPUBLISH_ENABLED: optionalBoolean("AI_AUTOPUBLISH_ENABLED", false),
  };
}
