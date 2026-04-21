# Stage 4.1 — план и назначение агентов

Цель: закрыть два decision point (**ADR-007**, **ADR-008**) и привести к коду только после явного выбора варианта.

## Роли (логические агенты)

### Product Logic Agent (владелец смысла)

**Отвечает за:** финализацию ADR-007 и ADR-008 (выбор варианта A/B/C), семантику `trigger_mode` (manual / auto), границы ответственности billing vs операторский booking.

**Subagents (логическое разбиение работ):**

| Subagent | Выход |
|----------|--------|
| **Booking Lifecycle ADR** | Текст решения по ADR-007 + список затрагиваемых модулей |
| **Commission Graph ADR** | Текст решения по ADR-008 + матрица или зоны переходов |

### Backend Agent (владелец реализации)

**Отвечает за:** реализацию выбранной стратегии, сужение permissive-режима (если выбрано), сохранение backward compatibility, миграции данных при необходимости.

**Subagents:**

| Subagent | Задачи |
|----------|--------|
| **Booking Engine Consolidation** | Вариант A: вызовы `applyBookingStatusTransition` из billing; вариант B: новое поле/события; вариант C: контракты и guards |
| **Commission Policy Hardening** | Граф или зоны в `shared-policy`, правки `applyCommissionReconciliationPatch`, согласование с `billing/service` |
| **Billing Integration** | Единая точка изменения комиссии/statement; события; идемпотентность |

### QA Agent

**Subagents:**

| Subagent | Фокус |
|----------|--------|
| **Billing Status QA** | Конфликт ручного PATCH booking и auto billing; регрессия `recordPayment` / `recordRefund` |
| **Commission Transition QA** | Недопустимые переходы после ужесточения; регрессия PATCH reconciliation |

### Documentation Agent

Обновляет: `STAGE4_STATUS_BACKBONE_AUDIT.md`, `STAGE4_CLOSE_REPORT.md`, ADR статусы (Proposed → Accepted), `docs/qa/BROWSER_CHECK_ROUTES.md` при смене контрактов.

## Порядок работ (рекомендуемый)

1. Product Logic: **Accept** ADR-007 и ADR-008 (выбранный вариант + rollback-условия).
2. Backend: минимальный diff под выбранный вариант + тесты.
3. QA: матрица сценариев из ADR.
4. Documentation: синхронизация.

## Rollback

До merge в `main`: откат ветки. После merge: feature-flag или обратный миграционный шаг только если менялась схема БД (вариант B).
