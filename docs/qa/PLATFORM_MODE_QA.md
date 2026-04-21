# Platform mode (launch / monetization) — минимальный QA

**Статус:** чеклист для приёмки после закрытия dev-этапа (2026-04-23). См. также [`PROJECT_SOURCEBOOK.md`](../PROJECT_SOURCEBOOK.md), [`migration/STAGE4_1_START_EXECUTION_REPORT.md`](../migration/STAGE4_1_START_EXECUTION_REPORT.md).

Цель: подтвердить корректность двух режимов без включения **commission strict-mode** в проде (решение только по violation snapshot).

## Переменные

| Переменная | Launch | Monetization |
|------------|--------|--------------|
| `PLATFORM_MODE` | `launch` или не задано (дефолт в коде = launch) | `monetization` |
| `COMMISSION_RECONCILIATION_STRICT_MODE` | не `true` в проде | не `true` до отдельного решения |

## Сценарии Launch Mode

1. **Расчёт комиссии без финансового требования**  
   - Завершить booking → сработает `recalculateCommissionForBooking`.  
   - В БД: `commissionAmountRub` > 0 при ненулевом net; в `calculationJson.platformMode === "launch"`, `financialDueRub === 0`.  
   - `commissionCollectedRub === 0`.

2. **Statements**  
   - Сгенерировать statement за период с eligible commissions.  
   - `commissionTotalRub === 0` на шапке ведомости; строки содержат рассчитанные суммы; в `notes` есть пометка Launch mode.

3. **Analytics**  
   - `GET /organizers/:id/analytics/overview` возвращает `views`, `clicks`, `leads`, `leadAttribution`, `platformMode`, `launchMode`.  
   - События `commission_accrued` содержат в payload `platform_mode`, `financial_due_rub: 0` при accrued.

4. **UI**  
   - `GET /public/platform` → `launchMode: true`.  
   - Страница организатора `/organizers/analytics` показывает воронку и блок Launch.  
   - Подсказки не требуют оплаты комиссии «сейчас».

5. **Admin**  
   - `GET /metrics/admin/platform-mode` с admin JWT → `platformMode: "launch"`.

## Сценарии Monetization Mode

1. **Расчёт и учёт**  
   - Установить `PLATFORM_MODE=monetization`, перезапустить API.  
   - Новая recalculate: в `calculationJson.platformMode === "monetization"`, без обязательного `financialDueRub: 0`.  
   - `commissionCollectedRub` не принудительно обнуляется при upsert (как в коде до launch-логики для денег к оплате).

2. **Statements**  
   - `commissionTotalRub` = сумма рассчитанных комиссий по строкам (как раньше).

3. **Совместимость данных**  
   - Записи, созданные в launch, сохраняют историю в `calculationJson` и commission rows; переключение режима не мигрирует задним числом — новые правила применяются к новым пересчётам.

4. **Admin / public**  
   - `GET /public/platform` → `launchMode: false`, `platformMode: "monetization"`.

## Регрессия

- `pnpm --filter @mywave/config build && pnpm --filter api build` — успех.  
- Не включать `COMMISSION_RECONCILIATION_STRICT_MODE=true` в прод без процесса из `STAGE4_1_COMMISSION_VIOLATION_SNAPSHOT.md`.
