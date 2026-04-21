/**
 * Env parsing. Source of truth: config_and_secrets_map.csv
 * Алиасы legacy → канон (TARGET_INTERNAL_TOKEN, TELEGRAM_BOT_TOKEN, OWNER_CHAT_ID): см. applyApiRuntimeEnvAliases.
 */

import { parsePlatformMode, type PlatformMode } from "./platformMode";

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
  /**
   * launch — первые месяцы: расчёты и события сохраняются, финансовый результат к списанию = 0.
   * monetization — обычный коммерческий режим.
   */
  PLATFORM_MODE: PlatformMode;
  DATABASE_URL: string;
  JWT_SECRET: string;
  ADMIN_JWT_SECRET: string;
  EMAIL_PROVIDER_KEY?: string;
  SENTRY_DSN?: string;
  INGESTION_DAILY_ENABLED: boolean;
  INGESTION_DAILY_HOUR_LOCAL: number;
  INGESTION_AUTOPUBLISH_ENABLED: boolean;
  INGESTION_DEFAULT_FALLBACK_IMAGE_URL?: string;
  /** Мин. интервал между ручными POST /sources/:id/run на один источник (мс). 0 = без лимита. */
  INGESTION_MANUAL_RUN_MIN_INTERVAL_MS: number;
  /** Мин. интервал между POST /sources/run (bulk) для одного админа (мс). 0 = без лимита. */
  INGESTION_MANUAL_BULK_MIN_INTERVAL_MS: number;
  /** Макс. число активных источников в одном ручном bulk run (mode all / список id / by_type). */
  INGESTION_MANUAL_BULK_MAX_SOURCES: number;
  /** Включает запись server-side analytics + ingestion. В prod рекомендуется включать явно. */
  ANALYTICS_ENABLED: boolean;
  /** Секрет для `POST /internal/analytics/*` (не путать с admin JWT). */
  INTERNAL_ANALYTICS_TOKEN?: string;
  /** Опционально: Telegram Bot API для алертов (`https://api.telegram.org/bot<token>/sendMessage`). */
  TELEGRAM_BOT_API_BASE_URL?: string;
  /** chat_id получателя алертов */
  TELEGRAM_ALERT_CHAT_ID?: string;
  /**
   * Опционально: отдельный chat_id для доставки лидов организатору через тот же Bot API base URL.
   * Если не задан — лиды уходят в ops fallback (TELEGRAM_ALERT_CHAT_ID / email).
   */
  TELEGRAM_ORGANIZER_CHAT_ID?: string;
  /**
   * Каркас доставки уведомлений в MAX (мессенджер): базовый URL HTTP API без завершающего `/`.
   * Путь и JSON тела настраиваются через MAX_MESSENGER_SEND_PATH и код `sendNotificationMax` после финализации контракта MAX.
   */
  MAX_MESSENGER_API_BASE_URL?: string;
  /** Путь относительно базы (например `/v1/messages`); пусто = `/send` (placeholder). */
  MAX_MESSENGER_SEND_PATH?: string;
  /** Опциональный Bearer для MAX API. */
  MAX_MESSENGER_ACCESS_TOKEN?: string;
  /** Включить попытку primary Telegram delivery для verified+signed организаторов (по умолчанию off). */
  LEADS_TELEGRAM_PRIMARY_ENABLED: boolean;
  /** Fallback email для ops, если Telegram недоступен (опционально). */
  BOOKING_FALLBACK_EMAIL?: string;
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
  /** Уведомления о стартах / смене дат (MVP). */
  NOTIFICATIONS_ENABLED: boolean;
  /** Ежедневный планировщик: постановка program_upcoming_start в очередь. */
  NOTIFICATIONS_SCHEDULER_ENABLED: boolean;
  /** Локальный час суток (0–23) для ежедневного прогона. */
  NOTIFICATIONS_DAILY_HOUR_LOCAL: number;
  /** За сколько календарных дней до старта (UTC) слать «скоро старт» (по умолчанию 14). */
  NOTIFICATIONS_UPCOMING_LEAD_DAYS: number;
  /** Интервал poller-а очереди в процессе API, мс (0 = не запускать встроенный poller). */
  NOTIFICATIONS_POLL_MS: number;
  /** Максимум доставок на одного получателя за календарный UTC-день. */
  NOTIFICATIONS_RATE_LIMIT_PER_DAY: number;
  /** Окно анти-flip по датам программы (часы), см. docs/qa/NOTIFICATIONS_MVP.md */
  NOTIFICATIONS_ANTI_FLIP_WINDOW_HOURS: number;
  /** From для Resend / SMTP-провайдера (Resend: проверенный домен). */
  NOTIFICATIONS_EMAIL_FROM?: string;
  /** Публичный host web-сайта (ссылки в письмах: /program/:id/ugc, /public/referral/:code). */
  NOTIFICATIONS_SITE_BASE_URL?: string;
  /** Публичный host API для шифрованных/токенизированных deeplink-ов (unsubscribe, UGC submit). */
  NOTIFICATIONS_LINK_BASE_URL?: string;
  /** Bypass email-подтверждения подписки на стейджинге (dev/staging only). */
  NOTIFICATIONS_EMAIL_CONFIRM_BYPASS?: boolean;
  /** Секрет для подписи токенов (подписка/UGC/referral). Фолбэк — JWT_SECRET. */
  NOTIFICATIONS_TOKEN_SECRET?: string;
  /** UGC growth loop: значение reward (5 = 5% или 5000₽ в зависимости от type). */
  REFERRAL_REWARD_VALUE: number;
  /** UGC growth loop: тип reward: percent | amount. */
  REFERRAL_REWARD_VALUE_TYPE: string;
  /** UGC growth loop: валюта для amount-reward (например RUB). */
  REFERRAL_REWARD_CURRENCY?: string;
  /** UGC growth loop: максимум booking-ов по одному коду за UTC-сутки. */
  REFERRAL_MAX_BOOKINGS_PER_DAY: number;
  /** Минимальная сумма заказа (в рублях), ниже которой reward-скидка не применяется. */
  REFERRAL_REWARD_MIN_ORDER_RUB: number;
  /**
   * Срок действия выданного reward (дней от момента создания). 0 — без `expiresAt` при выдаче (только ручные/legacy строки).
   * Истечение по календарю обрабатывает job `POST /jobs/run-reward-expiry`.
   */
  REFERRAL_REWARD_VALIDITY_DAYS: number;
  /**
   * Окно «скоро истечёт» для email (дней от now): expiresAt ∈ (now; now+window].
   * Job: `run-reward-expiry`, шаг до перевода в expired.
   */
  REFERRAL_REWARD_EXPIRY_REMINDER_WINDOW_DAYS: number;
  /**
   * Не слать напоминание, если reward создан менее N дней назад (анти-спам для свежих выдач).
   */
  REFERRAL_REWARD_REMINDER_MIN_AGE_DAYS: number;
  /** Включить economics guardrails (reward/referral). Выключить: ECON_GUARDRAILS_ENABLED=0 */
  ECON_GUARDRAILS_ENABLED: boolean;
  /** Порог средней доли скидки (%) за lookback; выше — глобальное reduce/suspend новых UserReward. */
  ECON_MAX_DISCOUNT_SHARE: number;
  /** Окно дней для метрик guardrails (глобальная доля скидки, программы). */
  ECON_GUARDRAILS_LOOKBACK_DAYS: number;
  /** Короткое окно (дней) для leading indicators vs long window; не больше long. */
  ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS: number;
  /** Early-warning: short vs long discount/commission и completion (мягкий nudge multiplier). */
  ECON_EARLY_WARNING_ENABLED: boolean;
  /** Сигнал: short_ratio > long_ratio × factor. */
  ECON_EARLY_WARNING_RATIO_SHORT_VS_LONG_FACTOR: number;
  /** Сигнал: completion_short < long × factor (например 0.85). */
  ECON_EARLY_WARNING_COMPLETION_SHORT_VS_LONG_FACTOR: number;
  /** Мягкое снижение program multiplier (bps) за срабатывание (не чаще 1× за run). */
  ECON_EARLY_WARNING_STEP_BPS: number;
  /** Мин. сумма commission (₽) в long window для сравнения ratio. */
  ECON_EARLY_WARNING_MIN_COMMISSION_RUB_LONG: number;
  ECON_EARLY_WARNING_MIN_COMMISSION_RUB_SHORT: number;
  /** Мин. число броней со скидкой в окне для completion short/long. */
  ECON_EARLY_WARNING_MIN_DISCOUNT_BOOKINGS_LONG: number;
  ECON_EARLY_WARNING_MIN_DISCOUNT_BOOKINGS_SHORT: number;
  /** Referral EW: падение доли броней в short vs ожидаемой (только флаг + audit). */
  ECON_REFERRAL_EW_ENABLED: boolean;
  /** actual_frac < expected_short_share / factor → флаг (expected ≈ shortDays/longDays). */
  ECON_REFERRAL_EW_VELOCITY_DROP_FACTOR: number;
  ECON_REFERRAL_EW_MIN_BOOKINGS_LONG: number;
  /** Глобально при превышении ECON_MAX_DISCOUNT_SHARE: reduce | suspend (только UserReward; referral-код всё равно выдаётся). */
  ECON_GLOBAL_REWARD_ACTION: "reduce" | "suspend";
  /** При global reduce: множитель значения reward в bps (5000 = 50%). */
  ECON_GLOBAL_REWARD_REDUCE_BPS: number;
  /** Мин. конверсия visit→booking (%) для «нормального» реферала; ниже — low_quality на коде. */
  ECON_MIN_REFERRAL_CONVERSION: number;
  /** Мин. визитов на коде, чтобы оценивать конверсию. */
  ECON_REFERRAL_CODE_MIN_VISITS: number;
  /** Мин. discount_to_completed_pct по программе (%); ниже — program suspended. */
  ECON_MIN_COMPLETION_RATE: number;
  /**
   * Пороги соотношения discount/commission по программе (см. runEconomicsGuardrailsJob).
   * Ниже soft — «здорово» (пошаговое восстановление multiplier к 10000).
   */
  ECON_PROGRAM_RATIO_SOFT: number;
  /** Выше — program multiplier = ECON_REWARD_MULTIPLIER_HARD_BPS. */
  ECON_PROGRAM_RATIO_HARD: number;
  /** Выше — multiplier 0 (эквивалент suspend). Legacy: ECON_PROGRAM_DISCOUNT_TO_COMMISSION_RATIO задаёт ZERO, если ZERO не задан. */
  ECON_PROGRAM_RATIO_ZERO: number;
  /** Множитель (bps) при «дорогой» программе: мягкий tier (например 7000 = 70%). */
  ECON_REWARD_MULTIPLIER_SOFT_BPS: number;
  /** Более жёсткий tier (например 5000 = 50%). */
  ECON_REWARD_MULTIPLIER_HARD_BPS: number;
  /** Шаг восстановления multiplier (bps) за прогон job при здоровых метриках. */
  ECON_REWARD_MULTIPLIER_RECOVERY_STEP_BPS: number;
  /** Порог expired/granted (%) для expiry health (только audit/log). */
  ECON_EXPIRY_HEALTH_RATIO: number;
  /** Оценка governance alerts (economics): commission drift, guardrails, digest. По умолчанию выключено. */
  ECON_GOVERNANCE_ALERTS_ENABLED: boolean;
  /** Встроенный poller evaluate + critical instant (при ALERTS_ENABLED). */
  ECON_GOVERNANCE_SCHEDULER_ENABLED: boolean;
  /** Интервал evaluate, мс (например 6 ч). */
  ECON_GOVERNANCE_EVAL_INTERVAL_MS: number;
  /** Не слать тот же critical в Telegram/email чаще, мс. */
  ECON_GOVERNANCE_CRITICAL_COOLDOWN_MS: number;
  /** Локальный час суток для daily digest warning/info (0–23). */
  ECON_GOVERNANCE_DIGEST_HOUR_LOCAL: number;
  /** Email для digest (Resend: EMAIL_PROVIDER_KEY + NOTIFICATIONS_EMAIL_FROM). */
  ECON_GOVERNANCE_ALERT_EMAIL?: string;
  /** JWT `sub` админов через запятую: опасные override (indefinite, force_suspend, referral force_low_quality). Пусто = без ограничения. */
  ECONOMICS_PRIVILEGED_ADMIN_SUBS?: string;
  /** Value-based воронка организатора (сообщения после порогов метрик по программе). */
  CONVERSION_FUNNEL_ENABLED: boolean;
  CONVERSION_FUNNEL_SCHEDULER_ENABLED: boolean;
  CONVERSION_FUNNEL_INTERVAL_MS: number;
  CONVERSION_STAGE1_MIN_VIEWS: number;
  CONVERSION_STAGE1_MIN_CLICKS: number;
  CONVERSION_STAGE2_MIN_LEADS: number;
  CONVERSION_STAGE3_MIN_VIEWS: number;
  CONVERSION_STAGE3_MIN_CLICKS: number;
  CONVERSION_STAGE3_MIN_LEADS: number;
  /** Если true — этап 3 дополнительно требует рост просмотров WoW ≥ CONVERSION_WEEK_GROWTH_MIN_PCT и leads ≥ 1. */
  CONVERSION_STAGE3_REQUIRE_LEADS_AND_GROWTH: boolean;
  CONVERSION_WEEK_GROWTH_MIN_PCT: number;
  /** Задержка между этапом 3 и 4 (часы). */
  CONVERSION_STAGE4_DELAY_HOURS: number;
  CONVERSION_STAGE5_MIN_LEADS: number;
  /** Минимум «сделок» (брони не в начальных статусах отмены) для этапа 5. */
  CONVERSION_STAGE5_MIN_DEALS: number;
  CONVERSION_FOLLOWUP_DELAY_HOURS: number;
  /** Ссылка для CTA «Обсудить условия» (mailto: или https:). */
  CONVERSION_DISCUSS_URL: string;
  /** Максимальный номер этапа, который может уйти автоматикой (0 = только onboarding; 2 = этапы 0–2). */
  CONVERSION_ALLOWED_MAX_STAGE: number;
  /** Этап 4 (мягкий оффер монетизации) — по умолчанию выкл. до явного rollout. */
  CONVERSION_ENABLE_STAGE4: boolean;
  /** Этап 5 (закрытие) — по умолчанию выкл. */
  CONVERSION_ENABLE_STAGE5: boolean;
  /** Follow-up после этапа 2 — можно выключить на первой фазе. */
  CONVERSION_ENABLE_FOLLOWUP: boolean;
  /** Минимум часов между любыми успешными conversion-сообщениями одному организатору (все программы). */
  CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS: number;
  /** Секрет в URL webhook Telegram для owner approval conversion drafts (см. POST /public/conversion-funnel/governance/:secret/telegram). */
  CONVERSION_TELEGRAM_WEBHOOK_SECRET?: string;
  /** Срок «решить по черновику» для owner (часы), без автосенда организатору по истечении. */
  CONVERSION_OWNER_APPROVAL_TTL_HOURS: number;
  /** Отложить напоминание owner на N часов (defer). */
  CONVERSION_OWNER_DEFER_HOURS: number;
  /** Алерт в ops Telegram при ownerNotifyFailed > 0 (см. conversion drafts). По умолчанию выкл. */
  CONVERSION_OWNER_NOTIFY_ALERT_ENABLED: boolean;
  /** Интервал проверки owner notify failures, мс. */
  CONVERSION_OWNER_NOTIFY_ALERT_INTERVAL_MS: number;
}

export function loadEnv(): Env {
  return {
    APP_ENV: required("APP_ENV"),
    PLATFORM_MODE: parsePlatformMode(optional("PLATFORM_MODE")),
    DATABASE_URL: required("DATABASE_URL"),
    JWT_SECRET: required("JWT_SECRET"),
    ADMIN_JWT_SECRET: required("ADMIN_JWT_SECRET"),
    EMAIL_PROVIDER_KEY: optional("EMAIL_PROVIDER_KEY"),
    SENTRY_DSN: optional("SENTRY_DSN"),
    INGESTION_DAILY_ENABLED: optionalBoolean("INGESTION_DAILY_ENABLED", false),
    INGESTION_DAILY_HOUR_LOCAL: optionalNumber("INGESTION_DAILY_HOUR_LOCAL", 8),
    INGESTION_AUTOPUBLISH_ENABLED: optionalBoolean("INGESTION_AUTOPUBLISH_ENABLED", false),
    INGESTION_DEFAULT_FALLBACK_IMAGE_URL: optional("INGESTION_DEFAULT_FALLBACK_IMAGE_URL"),
    INGESTION_MANUAL_RUN_MIN_INTERVAL_MS: optionalNumber("INGESTION_MANUAL_RUN_MIN_INTERVAL_MS", 30_000),
    INGESTION_MANUAL_BULK_MIN_INTERVAL_MS: optionalNumber("INGESTION_MANUAL_BULK_MIN_INTERVAL_MS", 90_000),
    INGESTION_MANUAL_BULK_MAX_SOURCES: optionalNumber("INGESTION_MANUAL_BULK_MAX_SOURCES", 40),
    ANALYTICS_ENABLED: optionalBoolean("ANALYTICS_ENABLED", false),
    INTERNAL_ANALYTICS_TOKEN: optional("INTERNAL_ANALYTICS_TOKEN"),
    TELEGRAM_BOT_API_BASE_URL: optional("TELEGRAM_BOT_API_BASE_URL"),
    TELEGRAM_ALERT_CHAT_ID: optional("TELEGRAM_ALERT_CHAT_ID"),
    TELEGRAM_ORGANIZER_CHAT_ID: optional("TELEGRAM_ORGANIZER_CHAT_ID"),
    MAX_MESSENGER_API_BASE_URL: optional("MAX_MESSENGER_API_BASE_URL"),
    MAX_MESSENGER_SEND_PATH: optional("MAX_MESSENGER_SEND_PATH"),
    MAX_MESSENGER_ACCESS_TOKEN: optional("MAX_MESSENGER_ACCESS_TOKEN"),
    LEADS_TELEGRAM_PRIMARY_ENABLED: optionalBoolean("LEADS_TELEGRAM_PRIMARY_ENABLED", false),
    BOOKING_FALLBACK_EMAIL: optional("BOOKING_FALLBACK_EMAIL"),
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
    NOTIFICATIONS_ENABLED: optionalBoolean("NOTIFICATIONS_ENABLED", false),
    NOTIFICATIONS_SCHEDULER_ENABLED: optionalBoolean("NOTIFICATIONS_SCHEDULER_ENABLED", false),
    NOTIFICATIONS_DAILY_HOUR_LOCAL: optionalNumber("NOTIFICATIONS_DAILY_HOUR_LOCAL", 9),
    NOTIFICATIONS_UPCOMING_LEAD_DAYS: optionalNumber("NOTIFICATIONS_UPCOMING_LEAD_DAYS", 14),
    NOTIFICATIONS_POLL_MS: optionalNumber("NOTIFICATIONS_POLL_MS", 0),
    NOTIFICATIONS_RATE_LIMIT_PER_DAY: optionalNumber("NOTIFICATIONS_RATE_LIMIT_PER_DAY", 15),
    NOTIFICATIONS_ANTI_FLIP_WINDOW_HOURS: optionalNumber("NOTIFICATIONS_ANTI_FLIP_WINDOW_HOURS", 48),
    NOTIFICATIONS_EMAIL_FROM: optional("NOTIFICATIONS_EMAIL_FROM"),
    NOTIFICATIONS_SITE_BASE_URL: optional("NOTIFICATIONS_SITE_BASE_URL"),
    NOTIFICATIONS_LINK_BASE_URL: optional("NOTIFICATIONS_LINK_BASE_URL"),
    NOTIFICATIONS_EMAIL_CONFIRM_BYPASS: optionalBoolean("NOTIFICATIONS_EMAIL_CONFIRM_BYPASS", false),
    NOTIFICATIONS_TOKEN_SECRET: optional("NOTIFICATIONS_TOKEN_SECRET"),
    REFERRAL_REWARD_VALUE: optionalNumber("REFERRAL_REWARD_VALUE", 5),
    REFERRAL_REWARD_VALUE_TYPE: optional("REFERRAL_REWARD_VALUE_TYPE") ?? "percent",
    REFERRAL_REWARD_CURRENCY: optional("REFERRAL_REWARD_CURRENCY"),
    REFERRAL_MAX_BOOKINGS_PER_DAY: optionalNumber("REFERRAL_MAX_BOOKINGS_PER_DAY", 20),
    REFERRAL_REWARD_MIN_ORDER_RUB: optionalNumber("REFERRAL_REWARD_MIN_ORDER_RUB", 0),
    REFERRAL_REWARD_VALIDITY_DAYS: optionalNumber("REFERRAL_REWARD_VALIDITY_DAYS", 365),
    REFERRAL_REWARD_EXPIRY_REMINDER_WINDOW_DAYS: optionalNumber("REFERRAL_REWARD_EXPIRY_REMINDER_WINDOW_DAYS", 7),
    REFERRAL_REWARD_REMINDER_MIN_AGE_DAYS: optionalNumber("REFERRAL_REWARD_REMINDER_MIN_AGE_DAYS", 7),
    ECON_GUARDRAILS_ENABLED: optionalBoolean("ECON_GUARDRAILS_ENABLED", true),
    ECON_MAX_DISCOUNT_SHARE: optionalNumber("ECON_MAX_DISCOUNT_SHARE", 25),
    ECON_GUARDRAILS_LOOKBACK_DAYS: optionalNumber("ECON_GUARDRAILS_LOOKBACK_DAYS", 30),
    ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS: optionalNumber("ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS", 7),
    ECON_EARLY_WARNING_ENABLED: optionalBoolean("ECON_EARLY_WARNING_ENABLED", true),
    ECON_EARLY_WARNING_RATIO_SHORT_VS_LONG_FACTOR: optionalNumber(
      "ECON_EARLY_WARNING_RATIO_SHORT_VS_LONG_FACTOR",
      1.5,
    ),
    ECON_EARLY_WARNING_COMPLETION_SHORT_VS_LONG_FACTOR: optionalNumber(
      "ECON_EARLY_WARNING_COMPLETION_SHORT_VS_LONG_FACTOR",
      0.85,
    ),
    ECON_EARLY_WARNING_STEP_BPS: optionalNumber("ECON_EARLY_WARNING_STEP_BPS", 1000),
    ECON_EARLY_WARNING_MIN_COMMISSION_RUB_LONG: optionalNumber(
      "ECON_EARLY_WARNING_MIN_COMMISSION_RUB_LONG",
      100,
    ),
    ECON_EARLY_WARNING_MIN_COMMISSION_RUB_SHORT: optionalNumber(
      "ECON_EARLY_WARNING_MIN_COMMISSION_RUB_SHORT",
      50,
    ),
    ECON_EARLY_WARNING_MIN_DISCOUNT_BOOKINGS_LONG: optionalNumber(
      "ECON_EARLY_WARNING_MIN_DISCOUNT_BOOKINGS_LONG",
      3,
    ),
    ECON_EARLY_WARNING_MIN_DISCOUNT_BOOKINGS_SHORT: optionalNumber(
      "ECON_EARLY_WARNING_MIN_DISCOUNT_BOOKINGS_SHORT",
      2,
    ),
    ECON_REFERRAL_EW_ENABLED: optionalBoolean("ECON_REFERRAL_EW_ENABLED", true),
    ECON_REFERRAL_EW_VELOCITY_DROP_FACTOR: optionalNumber("ECON_REFERRAL_EW_VELOCITY_DROP_FACTOR", 1.5),
    ECON_REFERRAL_EW_MIN_BOOKINGS_LONG: optionalNumber("ECON_REFERRAL_EW_MIN_BOOKINGS_LONG", 3),
    ECON_GLOBAL_REWARD_ACTION:
      optional("ECON_GLOBAL_REWARD_ACTION")?.toLowerCase() === "suspend" ? "suspend" : ("reduce" as const),
    ECON_GLOBAL_REWARD_REDUCE_BPS: optionalNumber("ECON_GLOBAL_REWARD_REDUCE_BPS", 5000),
    ECON_MIN_REFERRAL_CONVERSION: optionalNumber("ECON_MIN_REFERRAL_CONVERSION", 2),
    ECON_REFERRAL_CODE_MIN_VISITS: optionalNumber("ECON_REFERRAL_CODE_MIN_VISITS", 20),
    ECON_MIN_COMPLETION_RATE: optionalNumber("ECON_MIN_COMPLETION_RATE", 10),
    ECON_PROGRAM_RATIO_SOFT: optionalNumber("ECON_PROGRAM_RATIO_SOFT", 2),
    ECON_PROGRAM_RATIO_HARD: optionalNumber("ECON_PROGRAM_RATIO_HARD", 3),
    ECON_PROGRAM_RATIO_ZERO: optionalNumber(
      "ECON_PROGRAM_RATIO_ZERO",
      optionalNumber("ECON_PROGRAM_DISCOUNT_TO_COMMISSION_RATIO", 5),
    ),
    ECON_REWARD_MULTIPLIER_SOFT_BPS: optionalNumber("ECON_REWARD_MULTIPLIER_SOFT_BPS", 7000),
    ECON_REWARD_MULTIPLIER_HARD_BPS: optionalNumber("ECON_REWARD_MULTIPLIER_HARD_BPS", 5000),
    ECON_REWARD_MULTIPLIER_RECOVERY_STEP_BPS: optionalNumber("ECON_REWARD_MULTIPLIER_RECOVERY_STEP_BPS", 1000),
    ECON_EXPIRY_HEALTH_RATIO: optionalNumber("ECON_EXPIRY_HEALTH_RATIO", 50),
    ECON_GOVERNANCE_ALERTS_ENABLED: optionalBoolean("ECON_GOVERNANCE_ALERTS_ENABLED", false),
    ECON_GOVERNANCE_SCHEDULER_ENABLED: optionalBoolean("ECON_GOVERNANCE_SCHEDULER_ENABLED", false),
    ECON_GOVERNANCE_EVAL_INTERVAL_MS: optionalNumber("ECON_GOVERNANCE_EVAL_INTERVAL_MS", 21_600_000),
    ECON_GOVERNANCE_CRITICAL_COOLDOWN_MS: optionalNumber("ECON_GOVERNANCE_CRITICAL_COOLDOWN_MS", 21_600_000),
    ECON_GOVERNANCE_DIGEST_HOUR_LOCAL: optionalNumber("ECON_GOVERNANCE_DIGEST_HOUR_LOCAL", 9),
    ECON_GOVERNANCE_ALERT_EMAIL: optional("ECON_GOVERNANCE_ALERT_EMAIL"),
    ECONOMICS_PRIVILEGED_ADMIN_SUBS: optional("ECONOMICS_PRIVILEGED_ADMIN_SUBS"),
    CONVERSION_FUNNEL_ENABLED: optionalBoolean("CONVERSION_FUNNEL_ENABLED", false),
    CONVERSION_FUNNEL_SCHEDULER_ENABLED: optionalBoolean("CONVERSION_FUNNEL_SCHEDULER_ENABLED", false),
    CONVERSION_FUNNEL_INTERVAL_MS: optionalNumber("CONVERSION_FUNNEL_INTERVAL_MS", 900_000),
    CONVERSION_STAGE1_MIN_VIEWS: optionalNumber("CONVERSION_STAGE1_MIN_VIEWS", 50),
    CONVERSION_STAGE1_MIN_CLICKS: optionalNumber("CONVERSION_STAGE1_MIN_CLICKS", 10),
    CONVERSION_STAGE2_MIN_LEADS: optionalNumber("CONVERSION_STAGE2_MIN_LEADS", 3),
    CONVERSION_STAGE3_MIN_VIEWS: optionalNumber("CONVERSION_STAGE3_MIN_VIEWS", 100),
    CONVERSION_STAGE3_MIN_CLICKS: optionalNumber("CONVERSION_STAGE3_MIN_CLICKS", 30),
    CONVERSION_STAGE3_MIN_LEADS: optionalNumber("CONVERSION_STAGE3_MIN_LEADS", 5),
    CONVERSION_STAGE3_REQUIRE_LEADS_AND_GROWTH: optionalBoolean("CONVERSION_STAGE3_REQUIRE_LEADS_AND_GROWTH", false),
    CONVERSION_WEEK_GROWTH_MIN_PCT: optionalNumber("CONVERSION_WEEK_GROWTH_MIN_PCT", 5),
    CONVERSION_STAGE4_DELAY_HOURS: optionalNumber("CONVERSION_STAGE4_DELAY_HOURS", 48),
    CONVERSION_STAGE5_MIN_LEADS: optionalNumber("CONVERSION_STAGE5_MIN_LEADS", 10),
    CONVERSION_STAGE5_MIN_DEALS: optionalNumber("CONVERSION_STAGE5_MIN_DEALS", 1),
    CONVERSION_FOLLOWUP_DELAY_HOURS: optionalNumber("CONVERSION_FOLLOWUP_DELAY_HOURS", 96),
    CONVERSION_DISCUSS_URL: optional("CONVERSION_DISCUSS_URL") ?? "mailto:support@mywave.travel",
    CONVERSION_ALLOWED_MAX_STAGE: optionalNumber("CONVERSION_ALLOWED_MAX_STAGE", 2),
    CONVERSION_ENABLE_STAGE4: optionalBoolean("CONVERSION_ENABLE_STAGE4", false),
    CONVERSION_ENABLE_STAGE5: optionalBoolean("CONVERSION_ENABLE_STAGE5", false),
    CONVERSION_ENABLE_FOLLOWUP: optionalBoolean("CONVERSION_ENABLE_FOLLOWUP", true),
    CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS: optionalNumber("CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS", 48),
    CONVERSION_TELEGRAM_WEBHOOK_SECRET: optional("CONVERSION_TELEGRAM_WEBHOOK_SECRET"),
    CONVERSION_OWNER_APPROVAL_TTL_HOURS: optionalNumber("CONVERSION_OWNER_APPROVAL_TTL_HOURS", 48),
    CONVERSION_OWNER_DEFER_HOURS: optionalNumber("CONVERSION_OWNER_DEFER_HOURS", 24),
    CONVERSION_OWNER_NOTIFY_ALERT_ENABLED: optionalBoolean("CONVERSION_OWNER_NOTIFY_ALERT_ENABLED", false),
    CONVERSION_OWNER_NOTIFY_ALERT_INTERVAL_MS: optionalNumber("CONVERSION_OWNER_NOTIFY_ALERT_INTERVAL_MS", 3_600_000),
  };
}
