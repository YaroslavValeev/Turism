# Stage 4.1 — план реализации после Accepted ADR-007 и ADR-008

Предполагаемые **рекомендованные** варианты см. резолюции в теле ADR (ниже в репозитории обновлены секции «Резолюция к принятию»).

---

## 1. ADR-007 (рекомендация: вариант **C**)

**После Accepted:** код не обязан в 4.1 сразу вызывать `applyBookingStatusTransition` из billing.

**Обязательно в 4.1:**

| Действие | Файлы / артефакты |
|----------|-------------------|
| Зафиксировать контракт двух контуров | `docs/decisions/ADR-007` (секция Accepted), при необходимости `docs/architecture/` короткая схема |
| Единый helper для «целевого» derived-статуса | `services/api/src/modules/billing/deriveBookingStatus.ts` (extract из `service.ts`) + импорт в `billing/service.ts` |
| Явная связь событие ↔ источник | Уже есть `booking_payment_derived_status`; добавить в комментарии к helper ссылку на ADR-007 |
| Регрессия | Тесты на `recordPayment` / `recordRefund` + сценарий «было new → после оплаты derived» (если применимо к данным) |

**Осознанно остаётся direct write:** `prisma.booking.update` в billing до следующей волны (A/B).

**Тесты обязательны:**

- Существующие billing-пути не ломают суммы и статус после derived.
- Нет второго «тихого» писателя `bookingStatus` в новых модулях (ревью по чеклисту).

---

## 2. ADR-008 (рекомендация: вариант **B — зоны**)

**После Accepted:**

| Действие | Файлы |
|----------|--------|
| Матрица зон / допустимых переходов | `packages/shared-policy/src/commissionReconciliation.ts` — заменить permissive на `isValidCommissionReconciliationTransition(from, to)` по зонам |
| Единая точка PATCH | `services/api/src/modules/status-engine/applyCommissionReconciliationPatch.ts` — отказ 400 при нарушении |
| Billing → commission | `services/api/src/modules/billing/service.ts` — вызов общей функции валидации перехода перед `upsert`/`update` или вынесение в `applyCommission*` для auto-веток (минимальный рефактор без смены контрактов) |
| Доменные события | Уточнить `eventType` при auto vs manual (`triggerMode` уже есть) |

**Прямые writes, которые должны уйти под policy:**

- Любая смена `reconciliationStatus` в billing без проверки тем же правилом, что и PATCH.

**Осознанно могут остаться:**

- `commission.create` с начальным статусом из тела POST — только значения из allowlist и согласованные с зонами «входа».

**Тесты обязательны:**

- Vitest: недопустимые переходы (например `paid` → `draft`, если запрещено зонами).
- Регрессия: существующие happy-path PATCH и `recalculateCommissionForBooking`.

---

## 3. Go / No-Go по кодингу Stage 4.1

| Условие | Вердикт |
|---------|---------|
| ADR-007 и ADR-008 в статусе **Accepted** (подпись владельца / фиксация в PR) | **Go** на реализацию по плану выше |
| Только Proposed / обсуждение без Accepted | **No-Go** на изменение поведения графов и жёсткость 400 для commission |

**Рекомендация:** **No-Go** на merge кода Stage 4.1 до **Accepted**; подготовительные правки только документации и чеклистов — допустимы.

---

## 4. Принцип «не размазывать backbone» (обязательный)

- Новые смены доменных статусов — только через **`@mywave/shared-policy`** + **`apply*`** (или явно перечисленный **legacy allowlist** в `STAGE4_1_DIRECT_STATUS_WRITES.md` с датой).
- Прямые `data: { *Status }` в новых фичах — **запрещены** без записи в ADR и обновления остаточного списка.

См. также: `docs/migration/STAGE4_1_CODING_GUARDRAILS.md`.
