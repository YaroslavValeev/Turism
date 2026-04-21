# Governance alerts v1 (economics)

Автоматизация **реакции** на уже определённые сигналы (overview, guardrails, audit, `SourceRun`): оценка условий, запись в БД, дедупликация, доставка. Не добавляет новых бизнес-метрик.

**Связь:** ритм владельца — [`OWNER_ECONOMICS_RHYTHM.md`](./OWNER_ECONOMICS_RHYTHM.md); обзор API economics — [`ECONOMICS_ADMIN_API.md`](./ECONOMICS_ADMIN_API.md).

---

## Включение

| Переменная | Назначение |
|------------|------------|
| `ECON_GOVERNANCE_ALERTS_ENABLED=1` | Включить evaluate и запись алертов |
| `ECON_GOVERNANCE_SCHEDULER_ENABLED=1` | Встроенный цикл в процессе API (период — `ECON_GOVERNANCE_EVAL_INTERVAL_MS`, по умолчанию 6 ч) |
| `ECON_GOVERNANCE_CRITICAL_COOLDOWN_MS` | Минимальный интервал между **повторной** отправкой одного и того же critical (Telegram/email), по умолчанию 6 ч |
| `ECON_GOVERNANCE_DIGEST_HOUR_LOCAL` | Час локального времени сервера для попытки daily digest (если scheduler включён) |
| `ECON_GOVERNANCE_ALERT_EMAIL` | Получатель digest и critical по email |
| `TELEGRAM_ALERT_CHAT_ID` | Куда слать critical в Telegram |
| `EMAIL_PROVIDER_KEY`, `NOTIFICATIONS_EMAIL_FROM` | Нужны для email |

Ручной запуск без scheduler: `POST /admin/economics/alerts/evaluate`, digest: `POST /admin/economics/alerts/digest`.

---

## Severity

| Уровень | Поведение v1 |
|---------|----------------|
| `critical` | Мгновенно (после cooldown по `lastSentAt`): Telegram + email |
| `warning` | Запись в БД; в digest email (ежедневно, если есть открытые warning) |
| `info` | Зарезервировано; в v1 не эмитится — при появлении можно показывать только в админке / digest |

---

## Дедупликация и grouping

- **Fingerprint:** SHA-256 от `alertType | entityType | entityId | severity` (и аналогично для платформенных алертов), уникальный в таблице `governance_alerts`.
- Повторное срабатывание того же условия **обновляет** `lastSeenAt` и текст, но не создаёт вторую строку.
- **Critical:** повторная **доставка** в каналы не чаще, чем раз в `ECON_GOVERNANCE_CRITICAL_COOLDOWN_MS` для той же открытой записи (проверка `lastSentAt`).
- **Warning digest:** один письменный digest со списком открытых warning; у включённых в письмо записей обновляется `lastDigestAt`, глобально — `governance_digest_state.lastDigestSentAt`.

---

Полный каталог с колонкой «действие owner»: [`ALERT_CATALOG.md`](./ALERT_CATALOG.md).

## Типы алертов (v1)

| `alertType` | Severity | Смысл | Источник |
|-------------|----------|--------|----------|
| `commission_sum_drift` | critical | Расхождение суммы комиссии: `buildEconomicsOverview` vs независимая сумма по `Commission` в том же окне (допуск 0.1% или 1 ₽) | overview + raw |
| `reward_grant_blocked_burst` | critical | ≥ `10` audit-событий `reward_grant` → `blocked` за 24 ч | audit |
| `source_runs_failed_burst` | critical | ≥ `5` записей `SourceRun` со статусом `failed` за 24 ч | ingestion |
| `ingestion_sources_stuck` | warning | ≥ `3` активных источника с ошибкой и без успешного сбора 7d+ | `Source` |
| `conversion_owner_notify_failed` | warning / critical | Черновики с `ownerNotifyLastError` и без `ownerNotifiedAt`; critical при ≥ `5` | conversion drafts |
| `expiry_ratio_high` | warning | `expired / granted` (7d) выше `ECON_EXPIRY_HEALTH_RATIO` (%) | overview |
| `many_active_overrides` | warning | Сумма активных ручных override по программам и рефералам > `5` | guardrails dashboard |
| `program_multiplier_churn` | warning | По программе ≥ `3` изменения `economicsRewardMultiplierBps` в audit за 7 дней | audit, по одной строке на `programId` |
| `discount_surge_low_completion` | warning | WoW рост `total_discount_rub` ≥ 20% при `discount_to_completed_pct` < 15% и ненулевой скидке | overview (7d vs предыдущие 7d) |
| `recovery_organizer_cancelled_high` | warning | При ≥ `5` recovery за 7d доля `organizer_cancelled` среди recovery ≥ 50% | `userReward` |

Пороги burst / override захардкожены в `services/api/src/modules/economics/governanceAlerts/runCycle.ts` (кроме expiry — env).

---

## API и админка

- `GET /admin/economics/alerts` — открытые алерты (до 100), `critical_open_count`, `last_digest_sent_at`.
- UI: блок **Governance alerts** на `/admin/economics`.

---

## Что не входит в v1

Инцидент-менеджмент, acknowledge, RBAC по алертам, ML, внешний BI, push/SMS/Slack. Отдельный «info-only» daily digest для владельца без открытых warning не отправляется.

## К governance v2

- Авто-resolve с гистерезисом и SLA по типам.
- Настраиваемые пороги из env/БД, а не только константы.
- Подтверждение (ack) и мьют из UI с audit.
- Единый «incident» поверх нескольких fingerprint / корреляция.
