# MyWave Analytics Ops v1.1 — Go-Live Checklist

Короткий operational-чеклист для команды, разработчика и владельца перед включением на стенде / в production.

| Поле | Значение |
|------|----------|
| Версия | v1 |
| Контур | Analytics Runtime + Ops |

## 1. Цель включения

Перевести аналитический контур MyWave в рабочий режим без потери данных, без двойных джоб, с контролируемыми DQ-порогами, валидным traveler key, живыми score и понятным owner-ритмом.

**Обязательные артефакты в коде/доках:** backfill, scheduler/cron, DQ thresholds, score governance, playbooks, founder/dashboard, admin score columns.

**Критичные env:** `TRAVELER_KEY_SALT`, `ANALYTICS_ENABLED`, `INTERNAL_ANALYTICS_TOKEN`, `ANALYTICS_DQ_*`; при внутреннем планировщике — `ANALYTICS_OPS_*`.

**Один режим расписания:** либо внешний cron, либо внутренний scheduler. Одновременно оба режима не включать.

**Сигнал готовности:** первый успешный цикл: refresh marts → scores recalculate → alerts run, без critical DQ без объяснения.

---

## 2. Preflight перед включением

| ☐ | Проверка | Что сделать / что подтвердить | Статус / владелец |
|---|----------|-------------------------------|-------------------|
| ☐ | Green build | Прогнать: `pnpm --filter @mywave/config build`, `pnpm --filter api test`, `pnpm --filter admin build`. | Dev |
| ☐ | Env на целевом окружении | Задать `TRAVELER_KEY_SALT`, analytics tokens, DQ thresholds и один вариант scheduling. | DevOps |
| ☐ | Feature flags | Осознанно включить `ANALYTICS_ENABLED`; убедиться, что consent-aware tracking не шлёт лишнее до согласия. | Dev + PM |
| ☐ | Миграции | Применить `prisma migrate deploy` и убедиться, что схемы score / DQ / traveler key присутствуют. | DevOps |

---

## 3. База данных и backfill

| ☐ | Проверка | Что сделать / что подтвердить | Статус / владелец |
|---|----------|-------------------------------|-------------------|
| ☐ | Миграции БД | На API-окружении выполнить deploy миграций и проверить отсутствие pending migrations. | DevOps |
| ☐ | История traveler key | Один раз запустить `pnpm run backfill:traveler-key` из `services/api`. См. [`BACKFILL_RUNBOOK.md`](./BACKFILL_RUNBOOK.md). | DevOps |
| ☐ | Остаточные NULL | Снять долю незаполненных `travelerKeyHash` по Lead и Booking; зафиксировать результат в runbook. | Data / Dev |
| ☐ | Совместимость с legacy | Убедиться, что cohort / repeat логика не ломается на исторических данных без достаточного объёма. | Product + Data |

---

## 4. Расписание и операционный режим

| ☐ | Проверка | Что сделать / что подтвердить | Статус / владелец |
|---|----------|-------------------------------|-------------------|
| ☐ | Выбор scheduler | Зафиксировать только один режим: внешний cron **или** внутренний (`ANALYTICS_OPS_SCHEDULER_ENABLED`). См. [`SCHEDULE.md`](./SCHEDULE.md). | Owner + DevOps |
| ☐ | Частота | Определить cadence для refresh marts, score recalc, alerts run. Зафиксировать в `SCHEDULE.md` / infra. | DevOps |
| ☐ | Нет дубля | Убедиться, что второй scheduler не активирован скрыто в другом окружении. | DevOps |
| ☐ | Owner алертов | Назначить ответственного за Telegram alerts и playbook actions. | Owner |

---

## 5. Первый operational-цикл после включения

| ☐ | Проверка | Что сделать / что подтвердить | Статус / владелец |
|---|----------|-------------------------------|-------------------|
| ☐ | Refresh marts | Запустить первый цикл обновления marts и проверить, что founder / billing metrics не пустые без причины. | DevOps |
| ☐ | Recalculate scores | Вызвать `POST /internal/analytics/scores/recalculate` и убедиться, что снимки Organizer/Program Score созданы. | Dev |
| ☐ | Run alerts | Проверить, что alert-job отрабатывает и не создаёт ложных critical без объяснения. | DevOps |
| ☐ | Freshness | Проверить data freshness lag и время последнего успешного refresh на DQ dashboard. | Data |

---

## 6. Дашборды и качество данных

| ☐ | Проверка | Что сделать / что подтвердить | Статус / владелец |
|---|----------|-------------------------------|-------------------|
| ☐ | Founder Dashboard | Проверить summary, WoW-дельты, weak organizers/programs, рекомендации по действиям. | Owner + Product |
| ☐ | DQ Dashboard | Проверить ingestion errors, duplicates, lag, orphan events, refresh failures. См. [`DQ_PLAYBOOK.md`](./DQ_PLAYBOOK.md). | Dev + Data |
| ☐ | Billing / Founder daily | Убедиться, что metrics endpoints отдают живые данные либо корректный warning, но не 500. | Dev |
| ☐ | Admin списки | Убедиться, что score-колонки видны в organizers/programs и не ломают UX. | Ops |

---

## 7. Роли и ежедневный owner-ритм

| ☐ | Проверка | Что сделать / что подтвердить | Статус / владелец |
|---|----------|-------------------------------|-------------------|
| ☐ | Владелец | Смотрит NSM, DQ health, weak score entities, refund spikes. Принимает решения по приоритетам. | Owner |
| ☐ | Партнёрства | Разбирает weak organizers, response SLA, billing readiness, verification gaps. | Partnerships |
| ☐ | Модерация / Trust | Разбирает complaint / refund anomalies, safety gaps, слабые программы. | Moderation |
| ☐ | Финансы / Billing | Контролирует statements, realized commission, collection issues, disputed amounts. | Finance |

Подробные действия по ролям: [`ACTIONS_BY_ROLE.md`](./ACTIONS_BY_ROLE.md).

---

## 8. Красные флаги и действие по умолчанию

| Сигнал | Что делать сразу | Кто реагирует |
|--------|------------------|---------------|
| DQ critical / spike ingestion errors | Заморозить выводы по данным, проверить refresh/job logs, сравнить с baseline, открыть инцидент. | DevOps + Data |
| Сильный рост refund rate | Проверить организатора, программу, платежи и причины возврата; вынести на trust review. | Finance + Trust |
| Score резко падает WoW | Проверить sample size, новые complaints/refunds, response lag, completeness. | Partnerships |
| Нет новых событий при `ANALYTICS_ENABLED=true` | Проверить env, ingestion token, scheduler/cron, consent flow. | Dev |

---

## 9. Rollback / безопасная остановка

- При критической деградации можно временно выключить только internal scheduler или alerts, не ломая весь runtime.
- Если проблема в трекинге web-контракта, отключать client instrumentation точечно, не трогая server-side business events.
- Если проблема в score, заморозить показ score в UI и продолжить накопление сырья до исправления.
- Любой rollback фиксировать в runbook: дата, причина, owner, что отключили, когда восстановили.

---

## 10. Готово к prod-включению, если

- [ ] `admin` build зелёный;
- [ ] миграции применены;
- [ ] `TRAVELER_KEY_SALT` задан;
- [ ] backfill выполнен и остаточные NULL в допустимом диапазоне;
- [ ] выбран и включён только один scheduler;
- [ ] первый цикл jobs успешен;
- [ ] founder / DQ / billing dashboards показывают осмысленные данные;
- [ ] у alerts и playbooks есть owner.

Дополнительно: [`MANUAL_VALIDATION_PHASE_RUNTIME.md`](./MANUAL_VALIDATION_PHASE_RUNTIME.md), [`SCORE_GOVERNANCE.md`](./SCORE_GOVERNANCE.md).

---

*MyWave · Analytics Ops v1.1 · Go-Live Checklist · внутренний operational-документ (синхронизировано с репозиторием; исходный DOCX может храниться у владельца отдельно).*
