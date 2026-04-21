# ADR-008: Стратегия Commission `reconciliationStatus` (graph vs permissive)

## Статус

**Accepted** (2026-04-17) — зафиксирован **вариант B** (зоны + отдельный billing-auto контур). Реализация: `packages/shared-policy/src/commissionReconciliation.ts` (ручные переходы по зонам; `isValidCommissionReconciliationBillingTransition` для recalculate / statement).

## Резолюция к принятию (рекомендация Product Logic)

**Рекомендуется принять вариант B (зоны переходов)** как целевой для Stage 4.1.

**Почему:**

- Полный граф A (вариант A) для всех пар `COMMISSION_RECONCILIATION_STATUSES` быстро раздувается и дублирует бизнес-правила биллинга без явной пользы на текущем объёме.
- Пермиссивный режим C оставляет продуктовую дыру: технически разрешены переходы, недопустимые для финансового контура.
- **Зоны** дают предсказуемый «скелет» (например движение к `invoiced` / `paid` и отдельные ветки `reversed` / `disputed` / `written_off`) с меньшим числом рёбер, чем полная матрица, и естественно стыкуются с auto-переходами из `billing/service` при явной привязке зоны к источнику (manual vs auto в событиях).

**После Accepted:** реализовать проверку в `shared-policy` + отказ 400 в `applyCommissionReconciliationPatch`; привести auto-обновления комиссии в billing к тем же правилам (или к thin-wrapper вокруг той же функции валидации).

**Альтернатива:** если владелец продукта настаивает на минимальном изменении поведения — **временно принять C** с жёстким списком разрешённых сценариев в ADR и сроком пересмотра; рекомендация по умолчанию остаётся **B**.

## Контекст

После Stage 4:

- Админский PATCH `reconciliation` идёт через `applyCommissionReconciliationPatch`.
- Политика в `@mywave/shared-policy/commissionReconciliation` **пермиссивна**: допустим любой переход между двумя значениями из `COMMISSION_RECONCILIATION_STATUSES` (и смягчён вход для legacy значений `from` в БД).
- Доменные события частично отражают смысл: `invoice_issued` при переходе в `invoiced`, `invoice_paid` при `paid`, иначе общий тип перехода.

Это соответствует backward compatibility, но **не масштабируется** бесконтрольно: при росте billing/finance появятся недопустимые в продукте переходы, которые технически разрешены.

## Варианты

### Вариант A — Строгий граф переходов

- Матрица `ALLOWED[from] → to` в `shared-policy` (аналог `bookingTransitions`).
- `applyCommissionReconciliationPatch` отклоняет нелегальные переходы с **400** и явным `from`/`to`.
- Отдельно: какие переходы **manual** (admin), какие **auto** (billing pipeline), `triggerMode` в `DomainStatusEvent`.

### Вариант B — Зоны (states grouped) + правила между зонами

- Меньше жёстких рёбер: например `draft|pending_evidence → accrued → approved → invoiced → paid`, с явными исключениями для `reversed` / `disputed` / `written_off`.

### Вариант C — Оставить permissive, ограничить объём

- Зафиксировать в ADR: **только** текущие сценарии (список эндпоинтов и billing-хуков), любое расширение — только после расширения policy.

## Рекомендация

Перейти к **варианту A или B** до появления второго независимого писателя `reconciliationStatus` вне `applyCommissionReconciliationPatch` и billing (сейчас billing ещё пишет reconciliation в `recalculateCommissionForBooking` и при statement — см. аудит прямых записей).

## Последствия

- Ручной PATCH — только `isValidCommissionReconciliationTransition` (зоны; откат **settlement → intake** запрещён).
- Billing — только `isValidCommissionReconciliationBillingTransition` (`recalculate` | `statement_invoiced`); новые derived-типы и третьи писатели — только через ADR.
- Связь с ADR-007: если billing меняет booking и комиссию согласованно, граф комиссии должен учитывать **auto**-переходы из billing.

## Связанные документы

- `docs/migration/STAGE4_CLOSE_REPORT.md`
- `packages/shared-policy/src/commissionReconciliation.ts`
