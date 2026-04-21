# MyWave Travel: этапный план реализации

Версия: 1.0  
Дата: 2026-04-17  
Статус: execution plan (awaiting approval)

## 1) Что обнаружено

- Нужны не точечные UI-фиксы, а поэтапная продуктовая доработка трех контуров.
- Архитектурный фундамент уже есть, поэтому стратегия — incremental hardening без массовой ломки.

## 2) Почему это важно

- Этапность снижает риск регрессий в критических сценариях каталога, заявок и админки.
- Демо после каждого этапа дает управляемую приемку и раннее выявление проблем.

## 3) Какое решение предлагается

## Этап 0. Baseline audit freeze

- Содержимое:
  - фиксация baseline по страницам/маршрутам/формам/статусам/интеграциям;
  - согласование status+event модели.
- Зависимости: none
- Rollback point: docs-only rollback
- Совместимость: 100% backward-compatible
- Автоматизируемо Cursor Agents: сбор матриц, выявление gap между UI/API/docs
- Ручной контроль владельца: утверждение статусной матрицы и событий MVP

## Этап 1. Искатель: карточка и каталог

- Содержимое:
  - унификация шаблона детальной карточки;
  - условный рендер пустых секций;
  - кликабельные дисциплина/регион => каталог с фильтрами;
  - явное отражение активных фильтров.
- Зависимости: этап 0
- Rollback point: feature-flag на новый layout/links
- Совместимость: старые данные отображаются без падений (fallback label/value)
- Автоматизируемо: рефактор рендера, тесты роута, smoke e2e
- Ручной контроль: UX приемка readability и навигации
- Демо: 10 карточек, включая неполные/полные

## Этап 2. Форма заявки и доставка лида

- Содержимое:
  - обновление формы заявки (имя, контакт, комментарий, consent);
  - маршрутизация к нужному организатору и программе;
  - primary Telegram delivery для verified+contracted organizer;
  - fallback delivery (email/internal queue/admin alert);
  - event log delivery attempts.
- Зависимости: этап 0
- Rollback point: отключение Telegram adapter, fallback-only mode
- Совместимость: текущий POST /bookings сохраняется, расширяется полями
- Автоматизируемо: wiring adapters, unit/integration tests
- Ручной контроль: шаблоны сообщений и SLA подтверждения
- Демо: verified и fallback сценарии

## Этап 3. Путь организатора: onboarding + submit flow

- Содержимое:
  - обновление правил входа и CTA "Подать программу";
  - многошаговая форма подачи программы с draft-save и валидацией;
  - отделение organizer data и program data;
  - обязательные поля и controlled discipline/region;
  - визуализация verified/not verified в карточке.
- Зависимости: этапы 0-1
- Rollback point: возврат к текущему intake endpoint
- Совместимость: adapter для legacy `public-intake`
- Автоматизируемо: schema validation, step-form scaffolding
- Ручной контроль: финальный список mandatory полей
- Демо: submit сценарий + reject неполной карточки

## Этап 4. Админка: статусы и автоматизация

- Содержимое:
  - реализация status matrix по 4 группам (organizer/program/lead/commission);
  - разделение manual/auto transitions;
  - event-initiated transitions + status log timeline.
- Зависимости: этапы 0, 2, 3
- Rollback point: manual-only mode
- Совместимость: старые статусы маппятся через compatibility layer
- Автоматизируемо: policy transition guards + tests
- Ручной контроль: policy overrides и бизнес-решения
- Демо: минимум 10 сценариев переходов

## Этап 5. Комиссии, счета, синхронизация finance

- Содержимое:
  - расширение admin commissions view (фильтры/период/детализация сделки);
  - invoice/payment triggers;
  - sync в Google Sheets `Tourism_RUS.finance` с idempotency.
- Зависимости: этап 4
- Rollback point: sync disable flag, admin reconciliation only
- Совместимость: текущий billing/commission API сохраняется
- Автоматизируемо: sync worker + retries + dead-letter queue
- Ручной контроль: финальная финмодель и формулы комиссии
- Демо: тестовая оплата и обновление строки finance без дублей

## Этап 6. UX/UI pass + analytics instrumentation

- Содержимое:
  - унификация CTA/buttons/badges/empty states;
  - mobile сценарии;
  - event tracking на обязательный набор пользовательских событий.
- Зависимости: этапы 1-5
- Rollback point: disable new UI toggles/event dispatch
- Совместимость: без изменения доменной логики
- Автоматизируемо: UI polish + telemetry hooks
- Ручной контроль: дизайн-приемка и product copy
- Демо: сценарное прохождение traveler/organizer/admin

## Этап 7. QA, регрессия, приёмка

- Содержимое:
  - smoke + full QA по критическим 10 сценариям;
  - фиксация результатов, ограничений, open questions;
  - release readiness review.
- Зависимости: этапы 1-6
- Rollback point: release gate stop
- Совместимость: N/A
- Автоматизируемо: smoke scripts, regression checklist generation
- Ручной контроль: финальное go/no-go решение

## 4) Какие файлы/модули/папки затрагиваются

- `apps/web/src/app/*`
- `apps/web/src/components/*`
- `apps/admin/src/app/*`
- `services/api/src/modules/*`
- `packages/shared-schema/*`
- `packages/shared-policy/*`
- `docs/architecture/*`, `docs/migration/*`, `docs/qa/*`

## 5) Что переносим как есть

- Текущие рабочие API модули и канонические документы.
- Existing audit trail и часть статусных правил.

## 6) Что рефакторим

- Контракты карточки и onboarding формы.
- Delivery layer заявок.
- Статусные переходы с unified policy enforcement.
- Финансовую интеграцию и sync pipeline.

## 7) Что откладываем

- Юридический финальный текст договора.
- Долгий хвост нефункциональных улучшений после MVP hardening.

## 8) Риски

- Регрессия в каталоге при рефакторинге карточки.
- Потери lead delivery при недоделанном fallback.
- Конфликт статусов legacy/new.
- Дубли в Google Sheets при отсутствующей idempotency.

## 9) Критерий готовности

- Каждый этап завершен с отчетом:
  1. что сделано,
  2. что в работе,
  3. что требует решения,
  4. что заблокировано,
  5. какие файлы затронуты,
  6. что протестировано,
  7. риски,
  8. что готово к демонстрации.
- Финальная приемка проходит все 10 критических сценариев без блокирующих дефектов.

