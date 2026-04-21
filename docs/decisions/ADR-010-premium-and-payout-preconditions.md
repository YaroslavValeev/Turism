# ADR-010: Premium visibility, paid placement и preconditions для payouts / strict commission

## Статус

Принято — 2026-04-20 (рамочное решение для Wave 4)

## Контекст

Платформа остаётся **посредником**; комиссия — с состоявшейся сделки. Расширение монетизации (premium в каталоге, подписки, организаторский referral) не должно размывать **trust-first** positioning.

## Решения

### 1. Paid placement vs trust

- Любое **paid lift** в каталоге обязано иметь **явную маркировку** для пользователя («Спонсорское размещение» / «Продвижение») и не подменяет verified/trust badge.
- Лимиты на долю paid-слотов на странице выдачи и anti-gaming (запрет обхода через фейковые программы) — product policy + audit.

### 2. Payouts и settlement

- **Payout** организатору не является частью MVP assisted-booking; вводится только при:
  - стабильной **reconciliation** (комиссия, booking, commission row);
  - явном юридическом контурe (договор, реквизиты);
  - отдельном **pre-deploy checklist** (см. `ECONOMICS_PRIVILEGED_ADMIN_SUBS`, `GET /admin/economics/reconciliation/export`).

### 3. Commission strict-mode

- Включение **strict** режима для нарушений переходов комиссии (см. ADR-007/008) только после:
  - зелёного периода мониторинга `commission_transition_violation_detected`;
  - согласованного snapshot policy (как в Stage 4.1 runbook).

### 4. Зависимости данных

- Без **Wave 2** reconciliation-отчётов и RBAC на опасные override не масштабировать paid placement и автоматические списания.

## Последствия

- Реализация premium — отдельный product epic с схемой `placement` / `campaign` (будущая таблица), не смешивать с `Program.publishStatus`.
- Кошелёк пользователя и cashback — после стабильного reward/billing контура.

## Ссылки

- [`ADR-007-booking-billing-status-strategy.md`](./ADR-007-booking-billing-status-strategy.md)
- [`ADR-008-commission-reconciliation-strategy.md`](./ADR-008-commission-reconciliation-strategy.md)
- [`docs/operations/OWNER_ECONOMICS_RHYTHM.md`](../operations/OWNER_ECONOMICS_RHYTHM.md)
