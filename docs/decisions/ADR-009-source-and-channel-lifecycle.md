# ADR-009: Lifecycle источников парсинга и внешних каналов организатора

## Статус

Принято — 2026-04-20

## Контекст

Нужна одна каноническая модель для `Source` и `OrganizerExternalChannel` без двойных смыслов в UI, API и policy (авто-пауза при смене договора, ручные исключения, архив).

## Решение

### Канонические значения `lifecycleState` (строка в БД)

| Значение | Смысл |
|----------|--------|
| `active` | Источник участвует в расписании и может собираться (при `isActive=true`). |
| `inactive` | Вручную выключен; не собирается. |
| `paused_by_policy` | Автоматически переведён политикой (например, контракт не `signed` для `organizer_contract_auto`). |
| `manual_override` | **Каноническое имя в БД** для сценария продукта «manual only»: автоматика контракта **не** меняет pause/active для этой записи. В продуктовых текстах допустим синоним **manual_only** — это то же состояние, что `manual_override`. |
| `archived` | Историческая запись: не участвует в сборе и **не** перезаписывается policy-паузой (как и `manual_override`). Опционально `isActive=false`. |

### Маппинг продукт → БД

- **manual_only** (термин из спецификации) → хранить как **`manual_override`**.
- **archived** → хранить как **`archived`**.

### Policy при потере договора (`pauseContractAutoSources`)

Для источников с `sourceOrigin = organizer_contract_auto` обновляются только записи, у которых `lifecycleState` **не** в множестве защищённых: `manual_override`, `archived`.

### Внутренние vs внешние

- Программы/брони — домен платформы (`Program`, `Booking`).
- Каналы для парсинга анонсов — только `Source` / `OrganizerExternalChannel`; не смешивать сущности.

## Последствия

- UI фильтров и форм должен показывать канонические подписи; при необходимости подпись «manual only» для `manual_override`.
- Миграции enum в PostgreSQL не требуются: поле остаётся строкой.

## Ссылки

- [`services/api/src/modules/sources/sourceRegistry.ts`](../../services/api/src/modules/sources/sourceRegistry.ts)
- [`docs/operations/SOURCES_OWNER_INGESTION_RUNBOOK.md`](../operations/SOURCES_OWNER_INGESTION_RUNBOOK.md)
